import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  Eraser,
  Expand,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Heart,
  ImageIcon,
  ImagePlus,
  ExternalLink,
  Languages,
  Pause,
  Pencil,
  Play,
  Music2,
  Plus,
  ScanSearch,
  Share2,
  Sparkles,
  Search,
  Star,
  Tags,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { AppDialog } from "@/components/ui/AppDialog";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { TextArea } from "@/components/ui/TextArea";
import { NsfwImage } from "./NsfwImage";
import { VideoDetailSection } from "./video/VideoDetailSection";
import type {
  AiActionPreference,
  AiAnalyzePromptPayload,
  AiAnalyzeTarget,
  AiFeatureAction,
  AiProviderModelCapability,
  AiOptimizePromptPayload,
  AiPromptTranslationLanguage,
  AiReverseImagePromptPayload,
  AiRulePreset,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
} from "../types/ai";
import {
  aiFeatureActionMeta,
  buildAiActionInstructions,
  normalizeAiRulePresetIds,
  resolveAiActionRules,
} from "../types/ai";
import type { LibraryItem, PromptContentType, PromptLexiconSettings } from "../types/library";
import {
  addTags,
  applyAnalysisInlineChips,
  buildGeneratedPromptOptionValues,
  buildPromptOptionAnalysis,
  buildPromptAnalysisFromSavedCapsules,
  getNegativePromptValues,
  filterPromptOptionValues,
  isGenericPromptLabel,
  moveNegativePromptValuesFromPrompt,
  normalizeConcretePromptTags,
  omitNegativeAnalysisSections,
  splitNegativePromptFromPrompt,
  type PromptAnalysisResult,
} from "../utils/promptAnalysis";
import { mergePromptAnalysisTagsPreservingCategories } from "../utils/promptAnalysisMetadata";
import type { PromptAnalysisRunResult } from "../utils/remotePromptAnalysis";
import {
  getGenerationModelOptions,
  hideGenerationModelOption,
  isSameGenerationModelLabel,
  moveGenerationModelOption,
  resolveGenerationModelLabel,
  type GenerationModelPreferences,
} from "../utils/generationModels";
import { normalizePromptText } from "../utils/normalizePromptText";
import { isNsfwItem } from "../utils/nsfwRating";
import { normalizePhotographyCategorySuggestions } from "../utils/photographyCategories";
import { getPromptTypeLabel } from "../utils/promptType";
import { getImageSrc, getImageThumbnailSrc } from "../utils/getImageSrc";
import { buildAuthorAvatarSources } from "../utils/authorAvatarSources";
import { isAudioMediaFile, isVideoMediaFile } from "../utils/mediaFileTypes";
import {
  getStoredAudioMuted,
  getStoredAudioVolume,
  getStoredVideoMuted,
  getStoredVideoVolume,
  storeAudioMuted,
  storeAudioVolume,
  storeVideoMuted,
  storeVideoVolume,
} from "../utils/videoPlaybackPrefs";
import { createPortal } from "react-dom";
import { MediaFullscreenOverlay } from "./MediaFullscreenOverlay";
import { hasBuiltinModuleCapability, isBuiltinModuleInstalled } from "../utils/moduleRegistry";
import { useLibraryStore } from "../store/useLibraryStore";
import type { PromptCardData } from "../utils/promptFilters";
import {
  getPromptParameterLexiconValueScopes,
  mergePromptAnalysisParametersIntoLexicon,
  mergePromptParameterValuesIntoLexicon,
  type PromptParameterLexiconValue,
} from "../utils/promptLexicons";
import {
  normalizePromptSectionValue,
  parsePromptTemplateSegments,
  promptSectionMeta,
  resolvePromptSectionKeyForValue,
  resolvePromptTemplateText,
} from "../utils/promptSplit";

type PromptDetailSavePatch = Partial<
  Pick<
    LibraryItem,
    | "title"
    | "prompt"
    | "negativePrompt"
    | "tags"
    | "category"
    | "generationMethod"
    | "promptType"
    | "authorName"
    | "authorUrl"
    | "authorAvatarUrl"
  >
>;
type PromptCapsuleField = "prompt" | "negativePrompt";

type EditingChipState =
  | { kind: "category"; originalValue: string; value: string }
  | { kind: "tag"; originalValue: string; value: string };

type ActivePromptCapsule = {
  field: PromptCapsuleField;
  label: string;
  menuPosition: { left: number; top: number };
  parameterIndex: number;
  value: string;
  variable: string;
};

type AiProfileAction = Exclude<AiFeatureAction, "image-safety">;
type AiRecognitionKind = "category" | "tags";
type AiRecognitionSource = "image" | "prompt";

type ActiveAiProfileMenu = {
  action: AiProfileAction;
  position: { left: number; top: number };
  recognitionKind?: AiRecognitionKind;
};

type AiModelSelection = {
  profileId: string;
  modelId: string;
};

type PromptLanguageVersion = AiPromptTranslationLanguage;

type PromptTranslationDraft = AiTranslatePromptData & {
  language: PromptLanguageVersion;
};

type AiRuleSelection = {
  isUsingSettings: boolean;
  rulePresetIds: string[];
  rules: AiRulePreset[];
};

type PromptDraftSnapshot = {
  prompt: string;
  negativePrompt: string;
};

const maxAiCategoryCount = 10;
const maxAiTagCount = 15;
const originalDetailImageDelayMs = 350;
const detailInfoCardTone = {
  article: "border-capsule-sage-border hover:border-capsule-sage-border",
  header: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
  tag: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
} as const;
const detailPromptCardTone = {
  article: "border-primary/30 hover:border-primary/45",
  header: "border-primary/25 bg-primary-soft text-primary",
  tag: "border-primary/25 bg-primary-soft text-primary",
} as const;

type PromptDetailDialogProps = {
  item: PromptCardData;
  isBusy: boolean;
  imageCount: number;
  imageIndex: number;
  generationModelOrder: string[];
  hiddenGenerationModels: string[];
  aiSettings: PublicAiProviderSettings;
  blurNsfwImages: boolean;
  isImageLiked: boolean;
  knownCategories: string[];
  promptLexicons: PromptLexiconSettings | null;
  onAnalyzePrompt: (payload: AiAnalyzePromptPayload) => Promise<PromptAnalysisRunResult>;
  onClose: () => void;
  onCopyImage: () => void;
  onCopyText: (text: string) => void;
  onDelete: () => void;
  onExportImage: () => void;
  onImportClipboardImage: () => void;
  onImportImages: () => void;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onSave: (patch: PromptDetailSavePatch) => Promise<void>;
  onSaveGenerationModelPreferences: (patch: {
    generationModelOrder?: string[];
    hiddenGenerationModels?: string[];
  }) => void;
  onOptimizePrompt: (payload: AiOptimizePromptPayload) => Promise<string | null>;
  onTranslatePrompt: (payload: AiTranslatePromptPayload) => Promise<AiTranslatePromptData | null>;
  onReverseImagePrompt: (payload: AiReverseImagePromptPayload) => Promise<string | null>;
  onSavePromptLexicons: (promptLexicons: PromptLexiconSettings) => Promise<boolean>;
  onShareText: (text: string) => void;
  onToggleImageLike: () => void;
  onGenerateVideoFrames: (itemId: string) => Promise<boolean>;
  onImportVideoReferenceImages: (itemId: string) => Promise<boolean>;
  onDeleteVideoReferenceImage: (itemId: string, imageFileName: string) => Promise<boolean>;
  onImportClipboardReferenceImage: (itemId: string) => Promise<boolean>;
  onImportReferenceImageFromUrl: (itemId: string, url: string) => Promise<boolean>;
};

export function PromptDetailDialog({
  item,
  generationModelOrder,
  hiddenGenerationModels,
  aiSettings,
  blurNsfwImages,
  imageCount,
  imageIndex,
  isBusy,
  isImageLiked,
  knownCategories,
  promptLexicons,
  onAnalyzePrompt,
  onClose,
  onCopyImage,
  onCopyText,
  onDelete,
  onExportImage,
  onImportClipboardImage,
  onImportImages,
  onNavigateNext,
  onNavigatePrevious,
  onSave,
  onSaveGenerationModelPreferences,
  onOptimizePrompt,
  onTranslatePrompt,
  onReverseImagePrompt,
  onSavePromptLexicons,
  onShareText,
  onToggleImageLike,
  onGenerateVideoFrames,
  onImportVideoReferenceImages,
  onDeleteVideoReferenceImage,
  onImportClipboardReferenceImage,
  onImportReferenceImageFromUrl,
}: PromptDetailDialogProps) {
  const [isAuthorHidden, setIsAuthorHidden] = useState(false);
  const [isAuthorEditing, setIsAuthorEditing] = useState(false);
  const [authorNameDraft, setAuthorNameDraft] = useState(item.author ?? "");
  const [authorUrlDraft, setAuthorUrlDraft] = useState(item.authorUrl ?? "");
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [savedCategory, setSavedCategory] = useState(item.category);
  const [savedGenerationMethod, setSavedGenerationMethod] = useState(item.generationMethod);
  const [savedPromptType, setSavedPromptType] = useState<PromptContentType>(item.promptType);
  const [moduleNoticeText, setModuleNoticeText] = useState("");
  const [tagDrafts, setTagDrafts] = useState<string[]>(item.tags);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [promptDraft, setPromptDraft] = useState(item.prompt);
  const [negativePromptDraft, setNegativePromptDraft] = useState(item.negativePrompt);
  const [promptUndoSnapshot, setPromptUndoSnapshot] = useState<PromptDraftSnapshot | null>(null);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [analyzingTarget, setAnalyzingTarget] = useState<AiAnalyzeTarget | null>(null);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [isTranslatingPrompt, setIsTranslatingPrompt] = useState(false);
  const [promptLanguageVersion, setPromptLanguageVersion] = useState<PromptLanguageVersion>(() =>
    detectPromptLanguage(item.prompt, item.negativePrompt),
  );
  const [promptTranslationDraft, setPromptTranslationDraft] = useState<PromptTranslationDraft | null>(null);
  const [isReversingImagePrompt, setIsReversingImagePrompt] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PromptAnalysisResult | null>(null);
  const [localPromptLexicons, setLocalPromptLexicons] = useState(promptLexicons);
  const [analysisSourceLabel, setAnalysisSourceLabel] = useState("");
  const [editingChip, setEditingChip] = useState<EditingChipState | null>(null);
  const [activeCapsule, setActiveCapsule] = useState<ActivePromptCapsule | null>(null);
  const [generatedCapsuleOptions, setGeneratedCapsuleOptions] = useState<Record<string, string[]>>({});
  const [isGeneratingCapsuleOptions, setIsGeneratingCapsuleOptions] = useState(false);
  const [isNegativePromptVisible, setIsNegativePromptVisible] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [recognitionSourceByKind, setRecognitionSourceByKind] = useState<Record<AiRecognitionKind, AiRecognitionSource>>({
    category: "prompt",
    tags: "prompt",
  });
  const [selectedAiModelByAction, setSelectedAiModelByAction] = useState<
    Partial<Record<AiProfileAction, AiModelSelection>>
  >({});
  const [selectedAiRulePresetIdsByAction, setSelectedAiRulePresetIdsByAction] = useState<
    Partial<Record<AiProfileAction, string[]>>
  >({});
  const [activeAiProfileMenu, setActiveAiProfileMenu] = useState<ActiveAiProfileMenu | null>(null);
  const [revealedNsfwImageIds, setRevealedNsfwImageIds] = useState<Set<string>>(() => new Set());
  const [detailImageSource, setDetailImageSource] = useState<"thumbnail" | "original">("thumbnail");
  const detailImageAreaRef = useRef<HTMLDivElement | null>(null);
  const [detailImageMeta, setDetailImageMeta] = useState<{ ratio: number; capLong: number } | null>(null);
  const [videoOrientation, setVideoOrientation] = useState<"landscape" | "portrait" | null>(null);
  const [detailAvailableWidth, setDetailAvailableWidth] = useState(0);
  const [detailViewportHeight, setDetailViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const [isMediaFullscreen, setIsMediaFullscreen] = useState(false);
  const [isReferenceImagePopoverOpen, setIsReferenceImagePopoverOpen] = useState(false);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [isImportingReferenceImage, setIsImportingReferenceImage] = useState(false);
  const [deletingReferenceImage, setDeletingReferenceImage] = useState<string | null>(null);
  const deleteActionRef = useRef<HTMLDivElement | null>(null);
  const capsuleMenuRef = useRef<HTMLDivElement | null>(null);
  const aiProfileMenuRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const promptTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const referenceImagePopoverRef = useRef<HTMLDivElement | null>(null);
  const isAnalyzing = analyzingTarget !== null;
  const canNavigate = imageCount > 1;
  const currentIndexText = imageIndex >= 0 ? `${imageIndex + 1}/${imageCount}` : `1/${imageCount || 1}`;
  const isCurrentImageRevealed = revealedNsfwImageIds.has(item.id);
  const moduleState = useLibraryStore((state) => state.moduleState);
  const canUseVideoPromptModule = hasBuiltinModuleCapability("video-prompt-card", moduleState);
  const isCurrentMediaVideo = canUseVideoPromptModule && item.imageFileName ? isVideoMediaFile(item.imageFileName) : false;
  const isCurrentMediaLandscape = isCurrentMediaVideo && videoOrientation === "landscape";
  const currentMediaSrc = item.imageFileName ? getImageSrc(item.imageFileName, item.updatedAt) : "";
  const shouldBlurCurrentMedia = blurNsfwImages && isNsfwItem(item) && !isCurrentImageRevealed;
  const shouldShowNsfwRevealAction = blurNsfwImages && isNsfwItem(item);
  const sourcePromptLanguage = detectPromptLanguage(promptDraft, negativePromptDraft);
  const translatedPromptLanguage = promptTranslationDraft?.language ?? null;
  const isViewingTranslatedPrompt =
    Boolean(promptTranslationDraft) && promptLanguageVersion === translatedPromptLanguage;
  const activePromptDraft = isViewingTranslatedPrompt ? promptTranslationDraft?.prompt ?? "" : promptDraft;
  const activeNegativePromptDraft = isViewingTranslatedPrompt
    ? promptTranslationDraft?.negativePrompt ?? ""
    : negativePromptDraft;
  const targetTranslationLanguage: PromptLanguageVersion = promptLanguageVersion === "zh" ? "en" : "zh";
  const promptText = useMemo(
    () => buildPromptTextFromParts(activePromptDraft, activeNegativePromptDraft),
    [activeNegativePromptDraft, activePromptDraft],
  );
  const copyPromptText = useMemo(
    () => buildPromptTextFromParts(activePromptDraft, isNegativePromptVisible ? activeNegativePromptDraft : ""),
    [activeNegativePromptDraft, activePromptDraft, isNegativePromptVisible],
  );
  const shareText = useMemo(
    () => buildShareText({
      title: titleDraft,
      author: item.author,
      tags: tagDrafts,
      promptText,
    }),
    [item.author, promptText, tagDrafts, titleDraft],
  );
  const sourceLabel = item.sourceUrl ? "网络提示词" : "本地提示词";
  const modelLabel = resolveGenerationModelLabel({
    category: savedCategory,
    generationMethod: savedGenerationMethod,
    prompt: promptDraft,
    sourceUrl: item.sourceUrl,
    tags: tagDrafts,
    title: titleDraft,
  });
  const modelPreferences = useMemo<GenerationModelPreferences>(
    () => ({ generationModelOrder, hiddenGenerationModels }),
    [generationModelOrder, hiddenGenerationModels],
  );
  const modelOptions = useMemo(
    () => getVisibleModelOptions(modelSearch, modelLabel, modelPreferences),
    [modelLabel, modelPreferences, modelSearch],
  );
  const categoryChips = useMemo(
    () => getCategoryChips(savedCategory, tagDrafts, knownCategories),
    [knownCategories, savedCategory, tagDrafts],
  );
  const visibleTagDrafts = useMemo(
    () => getVisibleTagDrafts(tagDrafts, categoryChips),
    [categoryChips, tagDrafts],
  );
  const hasPromptCapsules = useMemo(
    () => analysisResult !== null || promptHasTemplateParameters(promptDraft) || promptHasTemplateParameters(negativePromptDraft),
    [analysisResult, negativePromptDraft, promptDraft],
  );
  const hasNegativePromptDraft = negativePromptDraft.trim().length > 0;
  const hasActiveNegativePromptDraft = activeNegativePromptDraft.trim().length > 0;
  const canUndoPromptChange =
    Boolean(promptUndoSnapshot) &&
    (promptUndoSnapshot?.prompt !== promptDraft || promptUndoSnapshot?.negativePrompt !== negativePromptDraft);

  useEffect(() => {
    const mountedAt = performance.now();
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        logPromptDetailEvent("detail-open:ready", {
          durationMs: Math.round(performance.now() - mountedAt),
          itemId: item.id,
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [item.id]);

  useEffect(() => {
    setIsAuthorHidden(false);
    setIsAuthorEditing(false);
    setAuthorNameDraft(item.author ?? "");
    setAuthorUrlDraft(item.authorUrl ?? "");
    setTitleDraft(item.title);
    setCategoryDraft("");
    setSavedCategory(item.category);
    setSavedGenerationMethod(item.generationMethod);
    setSavedPromptType(item.promptType);
    setTagDrafts(item.tags);
    setNewTagDraft("");
    setPromptDraft(item.prompt);
    setNegativePromptDraft(item.negativePrompt);
    setPromptUndoSnapshot(null);
    setIsPromptEditing(false);
    setAnalyzingTarget(null);
    setIsOptimizingPrompt(false);
    setIsTranslatingPrompt(false);
    setPromptLanguageVersion(detectPromptLanguage(item.prompt, item.negativePrompt));
    setPromptTranslationDraft(null);
    setIsReversingImagePrompt(false);
    setIsDeleteConfirmOpen(false);
    setAnalysisResult(null);
    setAnalysisSourceLabel("");
    setEditingChip(null);
    setActiveCapsule(null);
    setGeneratedCapsuleOptions({});
    setIsGeneratingCapsuleOptions(false);
    setIsNegativePromptVisible(false);
    setIsModelMenuOpen(false);
    setModelSearch("");
  }, [item.id]);

  useEffect(() => {
    let isCanceled = false;
    const startedAt = performance.now();

    const buildAnalysis = () => {
      if (isCanceled) {
        return;
      }

      const savedCapsuleAnalysis = buildSavedCapsuleAnalysis(item, item.prompt, item.negativePrompt, knownCategories);

      if (isCanceled) {
        return;
      }

      setAnalysisResult(savedCapsuleAnalysis);
      setAnalysisSourceLabel(savedCapsuleAnalysis ? "已保存" : "");
      logPromptDetailEvent("detail-analysis:ready", {
        durationMs: Math.round(performance.now() - startedAt),
        hasAnalysis: Boolean(savedCapsuleAnalysis),
        itemId: item.id,
      });
    };

    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(buildAnalysis, 0);
    });

    return () => {
      isCanceled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [item.id, item.prompt, item.negativePrompt, knownCategories]);

  useEffect(() => {
    setLocalPromptLexicons(promptLexicons);
  }, [promptLexicons]);

  useEffect(() => {
    setPromptTranslationDraft(null);
    setPromptLanguageVersion(detectPromptLanguage(promptDraft, negativePromptDraft));
  }, [negativePromptDraft, promptDraft]);

  useEffect(() => {
    setDetailImageSource("thumbnail");
    setVideoOrientation(null);

    if (!item.imageFileName || isVideoMediaFile(item.imageFileName)) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDetailImageSource("original");
    }, originalDetailImageDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [item.imageFileName]);

  useEffect(() => {
    setDetailImageMeta(null);

    const fileName = item.imageFileName;
    if (!fileName || isVideoMediaFile(fileName)) {
      return;
    }

    let cancelled = false;
    const probe = new window.Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        const thumbLong = Math.max(probe.naturalWidth, probe.naturalHeight);
        const capLong = thumbLong >= 600 ? Number.POSITIVE_INFINITY : thumbLong;
        setDetailImageMeta({
          ratio: probe.naturalWidth / probe.naturalHeight,
          capLong,
        });
      }
    };
    probe.src = getImageThumbnailSrc(fileName, item.updatedAt);

    return () => {
      cancelled = true;
      probe.onload = null;
    };
  }, [item.imageFileName, item.updatedAt]);

  useEffect(() => {
    const areaEl = detailImageAreaRef.current;
    if (!areaEl) {
      return;
    }

    const measure = () => {
      setDetailAvailableWidth(areaEl.clientWidth);
      setDetailViewportHeight(window.innerHeight);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(areaEl);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [item.imageFileName]);

  const detailImageBox = useMemo(() => {
    if (!detailImageMeta || detailAvailableWidth <= 0 || detailViewportHeight <= 0) {
      return null;
    }

    const { ratio, capLong } = detailImageMeta;
    const availW = detailAvailableWidth;
    const availH = detailViewportHeight * 0.8;
    let height = Math.min(availH, availW / ratio);
    let width = height * ratio;
    const longSide = Math.max(width, height);
    if (longSide > capLong) {
      const shrink = capLong / longSide;
      width *= shrink;
      height *= shrink;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }, [detailImageMeta, detailAvailableWidth, detailViewportHeight]);

  const useFixedDetailImageBox = detailImageBox != null && !isCurrentMediaVideo;

  useEffect(() => {
    const currentVideo = videoRef.current;

    if (currentVideo) {
      currentVideo.pause();
      currentVideo.currentTime = 0;
    }
  }, [item.imageFileName]);

  useEffect(() => {
    if (isPromptEditing) {
      promptTextAreaRef.current?.focus();
    }
  }, [isPromptEditing]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isDeleteConfirmOpen) {
          setIsDeleteConfirmOpen(false);
          return;
        }

        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleteConfirmOpen, onClose]);

  useEffect(() => {
    if (!isDeleteConfirmOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!deleteActionRef.current?.contains(event.target as Node)) {
        setIsDeleteConfirmOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDeleteConfirmOpen]);

  useEffect(() => {
    if (!isReferenceImagePopoverOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!referenceImagePopoverRef.current?.contains(event.target as Node)) {
        setIsReferenceImagePopoverOpen(false);
        setReferenceImagePreview(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isReferenceImagePopoverOpen]);

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (modelMenuRef.current?.contains(target) || modelButtonRef.current?.contains(target)) {
        return;
      }

      setIsModelMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModelMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModelMenuOpen]);

  useEffect(() => {
    const availableModels = new Set(
      getSelectableAiProfiles(aiSettings).flatMap((profile) =>
        profile.models.map((model) => `${profile.id}/${model.id}`),
      ),
    );

    setSelectedAiModelByAction((currentSelections) => {
      const nextSelections: Partial<Record<AiProfileAction, AiModelSelection>> = {};

      for (const [action, selection] of Object.entries(currentSelections) as [AiProfileAction, AiModelSelection][]) {
        if (availableModels.has(`${selection.profileId}/${selection.modelId}`)) {
          nextSelections[action] = selection;
        }
      }

      return nextSelections;
    });
  }, [aiSettings.profiles]);

  useEffect(() => {
    setSelectedAiRulePresetIdsByAction((currentSelections) => {
      const nextSelections: Partial<Record<AiProfileAction, string[]>> = {};

      for (const [action, rulePresetIds] of Object.entries(currentSelections) as [AiProfileAction, string[]][]) {
        const rules = resolveAiActionRules(action, aiSettings.actionPreferences[action]);
        const normalizedRulePresetIds = normalizeAiRulePresetIds(action, rulePresetIds, rules);

        if (normalizedRulePresetIds.length > 0 || rulePresetIds.length === 0) {
          nextSelections[action] = normalizedRulePresetIds;
        }
      }

      return nextSelections;
    });
  }, [aiSettings.actionPreferences]);

  useEffect(() => {
    if (!activeAiProfileMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element;

      if (aiProfileMenuRef.current?.contains(target) || target.closest("[data-ai-profile-trigger='true']")) {
        return;
      }

      setActiveAiProfileMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveAiProfileMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeAiProfileMenu]);

  useEffect(() => {
    if (!activeCapsule) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element;

      if (capsuleMenuRef.current?.contains(target) || target.closest("[data-prompt-capsule='true']")) {
        return;
      }

      setActiveCapsule(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveCapsule(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCapsule]);

  function commitTitle() {
    const nextTitle = titleDraft.trim();

    if (nextTitle === item.title) {
      return;
    }

    void onSave({ title: nextTitle });
  }

  function commitAuthor() {
    const nextAuthorName = authorNameDraft.trim() || null;
    const nextAuthorUrl = authorUrlDraft.trim() || null;

    setIsAuthorEditing(false);

    if (nextAuthorName === (item.author ?? null) && nextAuthorUrl === (item.authorUrl ?? null)) {
      return;
    }

    void onSave({ authorName: nextAuthorName, authorUrl: nextAuthorUrl });
  }

  function cancelAuthorEditing() {
    setAuthorNameDraft(item.author ?? "");
    setAuthorUrlDraft(item.authorUrl ?? "");
    setIsAuthorEditing(false);
  }

  function commitCategoryChips(nextCategories: readonly string[], nextVisibleTags = visibleTagDrafts) {
    const normalizedCategories = normalizeCategorySuggestions(nextCategories, knownCategories).slice(0, maxAiCategoryCount);
    const nextCategory = normalizedCategories[0] ?? "未分类";
    const nextTags = buildStoredTagsFromVisibleTags(nextVisibleTags, normalizedCategories);

    setEditingChip(null);
    setCategoryDraft("");
    setSavedCategory(nextCategory);
    setTagDrafts(nextTags);
    void onSave({ category: nextCategory, tags: nextTags });
  }

  function addCategoryChip(nextValue = categoryDraft) {
    const nextCategory = resolveCategoryChoice(nextValue, knownCategories);

    if (nextCategory === "未分类") {
      setCategoryDraft("");
      return;
    }

    commitCategoryChips(addTags(categoryChips, [nextCategory]));
  }

  function renameCategoryChip(originalCategory: string, nextValue: string) {
    const nextCategory = resolveCategoryChoice(nextValue, knownCategories);
    const nextCategories =
      nextCategory === "未分类"
        ? categoryChips.filter((category) => !isSameLabel(category, originalCategory))
        : categoryChips.map((category) => (isSameLabel(category, originalCategory) ? nextCategory : category));

    commitCategoryChips(nextCategories);
  }

  function removeCategoryChip(categoryToRemove: string) {
    commitCategoryChips(categoryChips.filter((category) => !isSameLabel(category, categoryToRemove)));
  }

  function commitVisibleTags(nextVisibleTags: readonly string[]) {
    const normalizedVisibleTags = normalizeConcretePromptTags(nextVisibleTags)
      .filter((tag) => !categoryChips.some((category) => isSameLabel(category, tag)))
      .slice(0, maxAiTagCount);
    const nextTags = buildStoredTagsFromVisibleTags(normalizedVisibleTags, categoryChips);

    setTagDrafts(nextTags);
    void onSave({ tags: nextTags });
  }

  function commitModel(nextValue: string | null) {
    const nextModel = nextValue?.trim() || null;
    const nextGenerationMethod = nextModel && nextModel !== "未识别模型" ? nextModel : null;

    setSavedGenerationMethod(nextGenerationMethod ?? (item.sourceUrl ? "网络提示词" : "本地提示词"));
    setIsModelMenuOpen(false);
    setModelSearch("");
    void onSave({ generationMethod: nextGenerationMethod });
  }

  function commitPromptType(nextPromptType: PromptContentType) {
    if (nextPromptType === "video" && !canUseVideoPromptModule) {
      const isInstalled = isBuiltinModuleInstalled("video-prompt", moduleState);
      setModuleNoticeText(
        isInstalled
          ? "视频模块未启用，请先在模块管理中启用。"
          : "视频模块未安装，请先在模块管理中安装。",
      );
      return;
    }

    setModuleNoticeText("");
    setSavedPromptType(nextPromptType);
    void onSave({ promptType: nextPromptType });
  }

  function hideModelOption(model: string) {
    onSaveGenerationModelPreferences({
      hiddenGenerationModels: hideGenerationModelOption(hiddenGenerationModels, model),
    });
  }

  function moveModelOption(sourceModel: string, targetModel: string) {
    onSaveGenerationModelPreferences({
      generationModelOrder: moveGenerationModelOption(generationModelOrder, sourceModel, targetModel),
    });
  }

  function addCategoryFromInput() {
    if (!categoryDraft.trim()) {
      setCategoryDraft("");
      return;
    }

    addCategoryChip(categoryDraft);
  }

  function resolveAiModelSelection(action: AiProfileAction): AiModelSelection | undefined {
    const selectedSelection = selectedAiModelByAction[action];

    if (selectedSelection && hasAiModelSelection(aiSettings, selectedSelection)) {
      return selectedSelection;
    }

    const preferredSelection = aiSettings.actionPreferences[action];

    if (
      preferredSelection?.profileId &&
      preferredSelection.modelId &&
      hasAiModelSelection(aiSettings, {
        profileId: preferredSelection.profileId,
        modelId: preferredSelection.modelId,
      })
    ) {
      return {
        profileId: preferredSelection.profileId,
        modelId: preferredSelection.modelId,
      };
    }

    const selectableProfiles = getSelectableAiProfiles(aiSettings);
    const activeProfile =
      selectableProfiles.find((profile) => profile.id === aiSettings.activeProfileId) ?? selectableProfiles[0];
    const activeModel =
      activeProfile?.models.find((model) => model.id === activeProfile.model) ?? activeProfile?.models[0];

    return activeProfile && activeModel
      ? {
          profileId: activeProfile.id,
          modelId: activeModel.id,
        }
      : undefined;
  }

  function resolveAiRuleSelection(action: AiProfileAction): AiRuleSelection {
    const preference = aiSettings.actionPreferences[action];
    const rules = resolveAiActionRules(action, preference);
    const selectedRulePresetIds = selectedAiRulePresetIdsByAction[action];

    if (Array.isArray(selectedRulePresetIds)) {
      return {
        isUsingSettings: false,
        rulePresetIds: normalizeAiRulePresetIds(action, selectedRulePresetIds, rules),
        rules,
      };
    }

    if (Array.isArray(preference?.rulePresetIds)) {
      return {
        isUsingSettings: true,
        rulePresetIds: normalizeAiRulePresetIds(action, preference.rulePresetIds, rules),
        rules,
      };
    }

    if (Array.isArray(preference?.rules)) {
      return {
        isUsingSettings: true,
        rulePresetIds: [],
        rules,
      };
    }

    return {
      isUsingSettings: true,
      rulePresetIds: normalizeAiRulePresetIds(action, [aiFeatureActionMeta[action].defaultRulePreset.id], rules),
      rules,
    };
  }

  function resolveAiCustomInstructions(action: AiProfileAction): string {
    const preference = aiSettings.actionPreferences[action] as AiActionPreference | undefined;
    const ruleSelection = resolveAiRuleSelection(action);

    return buildAiActionInstructions(action, {
      ...preference,
      rules: ruleSelection.rules,
      rulePresetIds: ruleSelection.rulePresetIds,
    });
  }

  function toAiActionPayloadSelection(action: AiProfileAction): {
    apiModelId?: string;
    apiProfileId?: string;
    customInstructions?: string;
  } {
    const customInstructions = resolveAiCustomInstructions(action);

    return {
      ...toAiPayloadSelection(resolveAiModelSelection(action)),
      customInstructions,
    };
  }

  function openAiProfileMenu(
    event: ReactMouseEvent<HTMLElement>,
    action: AiProfileAction,
    recognitionKind?: AiRecognitionKind,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 572;
    const menuHeight = 560;
    const left = Math.max(16, Math.min(event.clientX, window.innerWidth - menuWidth - 16));
    const top = Math.max(16, Math.min(event.clientY, window.innerHeight - menuHeight - 16));

    setActiveAiProfileMenu({
      action,
      position: { left, top },
      recognitionKind,
    });
  }

  function selectAiRecognitionSource(kind: AiRecognitionKind, source: AiRecognitionSource) {
    const action = getRecognitionAction(kind, source);

    setRecognitionSourceByKind((currentSources) => ({
      ...currentSources,
      [kind]: source,
    }));
    setActiveAiProfileMenu((currentMenu) =>
      currentMenu && currentMenu.recognitionKind === kind
        ? {
            ...currentMenu,
            action,
          }
        : currentMenu,
    );
  }

  function selectAiModel(action: AiProfileAction, selection: AiModelSelection) {
    setSelectedAiModelByAction((currentSelections) => ({
      ...currentSelections,
      [action]: selection,
    }));
    setActiveAiProfileMenu(null);
  }

  function toggleAiRuleSelection(action: AiProfileAction, ruleId: string) {
    const ruleSelection = resolveAiRuleSelection(action);
    const nextRulePresetIds = ruleSelection.rulePresetIds.includes(ruleId)
      ? ruleSelection.rulePresetIds.filter((id) => id !== ruleId)
      : [...ruleSelection.rulePresetIds, ruleId];

    setSelectedAiRulePresetIdsByAction((currentSelections) => ({
      ...currentSelections,
      [action]: normalizeAiRulePresetIds(action, nextRulePresetIds, ruleSelection.rules),
    }));
  }

  function clearAiRuleSelection(action: AiProfileAction) {
    setSelectedAiRulePresetIdsByAction((currentSelections) => ({
      ...currentSelections,
      [action]: [],
    }));
  }

  function resetAiRuleSelection(action: AiProfileAction) {
    setSelectedAiRulePresetIdsByAction((currentSelections) => {
      const nextSelections = { ...currentSelections };

      delete nextSelections[action];

      return nextSelections;
    });
  }

  async function recognizeCategory() {
    if (isAnalyzing) {
      return;
    }

    const action = getRecognitionAction("category", recognitionSourceByKind.category);
    const usesPrompt = action === "prompt-category";

    setAnalyzingTarget(action);

    try {
      const result = await onAnalyzePrompt({
        target: action,
        ...toAiActionPayloadSelection(action),
        title: usesPrompt ? titleDraft : "",
        imageFileName: usesPrompt ? undefined : item.imageFileName,
        prompt: usesPrompt ? promptDraft : "",
        negativePrompt: usesPrompt ? negativePromptDraft : "",
        tags: [],
        category: usesPrompt ? "未分类" : savedCategory,
        knownCategories,
      });
      const suggestions = normalizePhotographyCategorySuggestions([
        ...result.analysis.suggestedCategories,
        result.analysis.primaryCategory,
      ]).slice(0, maxAiCategoryCount);
      const nextCategories = normalizeCategorySuggestions(addTags(categoryChips, suggestions), knownCategories).slice(
        0,
        maxAiCategoryCount,
      );

      if (!areStringArraysEqual(nextCategories, categoryChips)) {
        commitCategoryChips(nextCategories);
      }
    } finally {
      setAnalyzingTarget(null);
    }
  }

  async function recognizeTags() {
    if (isAnalyzing) {
      return;
    }

    const action = getRecognitionAction("tags", recognitionSourceByKind.tags);
    const usesPrompt = action === "prompt-tags";

    setAnalyzingTarget(action);

    try {
      const result = await onAnalyzePrompt({
        target: action,
        ...toAiActionPayloadSelection(action),
        title: usesPrompt ? titleDraft : "",
        imageFileName: usesPrompt ? undefined : item.imageFileName,
        prompt: usesPrompt ? promptDraft : "",
        negativePrompt: usesPrompt ? negativePromptDraft : "",
        tags: [],
        category: usesPrompt ? "未分类" : savedCategory,
      });
      const nextTags = uniquePromptLabels(
        addTags(
          visibleTagDrafts,
          result.analysis.suggestedTags.filter(
            (tag) => !categoryChips.some((category) => isSameLabel(category, tag)),
          ),
        ),
      ).slice(0, maxAiTagCount);

      if (!areStringArraysEqual(nextTags, visibleTagDrafts)) {
        commitVisibleTags(nextTags);
      }
    } finally {
      setAnalyzingTarget(null);
    }
  }

  function rememberPromptUndoSnapshot() {
    setPromptUndoSnapshot({
      prompt: promptDraft,
      negativePrompt: negativePromptDraft,
    });
  }

  function startPromptEditing() {
    rememberPromptUndoSnapshot();
    setIsPromptEditing(true);
  }

  function undoPromptChange() {
    if (!promptUndoSnapshot || !canUndoPromptChange) {
      return;
    }

    const nextPrompt = promptUndoSnapshot.prompt;
    const nextNegativePrompt = promptUndoSnapshot.negativePrompt;
    const savedCapsuleAnalysis = buildSavedCapsuleAnalysis(item, nextPrompt, nextNegativePrompt, knownCategories);

    setPromptDraft(nextPrompt);
    setNegativePromptDraft(nextNegativePrompt);
    setPromptUndoSnapshot(null);
    setAnalysisResult(savedCapsuleAnalysis);
    setAnalysisSourceLabel(savedCapsuleAnalysis ? "已保存" : "");
    setActiveCapsule(null);
    setGeneratedCapsuleOptions({});
    setIsNegativePromptVisible(nextNegativePrompt.trim().length > 0 && isNegativePromptVisible);
    void onSave({ prompt: nextPrompt, negativePrompt: nextNegativePrompt });
  }

  function commitPrompt() {
    const nextPrompt = promptDraft.trim();
    const nextNegativePrompt = negativePromptDraft.trim();
    const savedCapsuleAnalysis = buildSavedCapsuleAnalysis(item, nextPrompt, nextNegativePrompt, knownCategories);

    setAnalysisResult(savedCapsuleAnalysis);
    setAnalysisSourceLabel(savedCapsuleAnalysis ? "已保存" : "");
    setActiveCapsule(null);
    saveAnalysisParametersToLexicon(savedCapsuleAnalysis);

    if (nextPrompt !== item.prompt || nextNegativePrompt !== item.negativePrompt) {
      void onSave({ prompt: nextPrompt, negativePrompt: nextNegativePrompt });
    }
  }

  function clearPromptCapsules() {
    if (!hasPromptCapsules) {
      return;
    }

    const nextPrompt = resolvePromptTemplateText(promptDraft, { explicitParameters: true }).trim();
    const nextNegativePrompt = resolvePromptTemplateText(negativePromptDraft, { explicitParameters: true }).trim();

    const promptChanged = nextPrompt !== promptDraft || nextNegativePrompt !== negativePromptDraft;

    if (promptChanged) {
      rememberPromptUndoSnapshot();
      setPromptDraft(nextPrompt);
      setNegativePromptDraft(nextNegativePrompt);
    }

    setAnalysisResult(null);
    setAnalysisSourceLabel("");
    setActiveCapsule(null);
    setGeneratedCapsuleOptions({});

    if (promptChanged && (nextPrompt !== item.prompt || nextNegativePrompt !== item.negativePrompt)) {
      void onSave({ prompt: nextPrompt, negativePrompt: nextNegativePrompt });
    }
  }

  async function handleImportReferenceImageFromLocal() {
    setIsImportingReferenceImage(true);
    try {
      const success = await onImportVideoReferenceImages(item.id);
      if (success) {
        setReferenceImagePreview(null);
        setIsReferenceImagePopoverOpen(false);
      }
    } finally {
      setIsImportingReferenceImage(false);
    }
  }

  async function handleImportReferenceImageFromClipboard() {
    setIsImportingReferenceImage(true);
    try {
      const success = await onImportClipboardReferenceImage(item.id);
      if (success) {
        setReferenceImagePreview(null);
        setIsReferenceImagePopoverOpen(false);
      }
    } finally {
      setIsImportingReferenceImage(false);
    }
  }

  async function handleDeleteReferenceImage(imageFileName: string) {
    if (deletingReferenceImage) {
      return;
    }
    if (referenceImagePreview === imageFileName) {
      setReferenceImagePreview(null);
    }
    setDeletingReferenceImage(imageFileName);
    try {
      await onDeleteVideoReferenceImage(item.id, imageFileName);
    } finally {
      setDeletingReferenceImage(null);
    }
  }

  async function applyPromptAnalysisToDraft(
    sourcePrompt: string,
    sourceNegativePrompt: string,
    options: { rememberUndoOnPromptChange?: boolean } = {},
  ) {
    const promptAnalysisSelection = toAiActionPayloadSelection("prompt");
    const result = await onAnalyzePrompt({
      target: "prompt",
      apiProfileId: promptAnalysisSelection.apiProfileId,
      apiModelId: promptAnalysisSelection.apiModelId,
      customInstructions: promptAnalysisSelection.customInstructions,
      title: titleDraft,
      prompt: sourcePrompt,
      negativePrompt: sourceNegativePrompt,
      tags: tagDrafts,
      category: savedCategory,
      knownCategories,
    });
    const negativeValues = getNegativePromptValues(result.analysis);
    const visibleAnalysis = omitNegativeAnalysisSections(result.analysis);
    const movedPrompts = moveNegativePromptValuesFromPrompt(sourcePrompt, sourceNegativePrompt, negativeValues);
    const nextPrompt = applyAnalysisInlineChips(movedPrompts.prompt, visibleAnalysis);
    const storedCategoryTags = tagDrafts.filter((tag) =>
      categoryChips.some((category) => isSameLabel(category, tag)),
    );
    const nextTags = mergePromptAnalysisTagsPreservingCategories({
      categoryLabels: categoryChips,
      maxVisibleTagCount: maxAiTagCount,
      storedCategoryTags,
      suggestedTags: visibleAnalysis.suggestedTags,
      visibleTags: visibleTagDrafts,
    });
    const patch: PromptDetailSavePatch = {};
    const willChangePrompt = nextPrompt !== promptDraft || movedPrompts.negativePrompt !== negativePromptDraft;

    if (willChangePrompt && options.rememberUndoOnPromptChange !== false) {
      rememberPromptUndoSnapshot();
    }

    if (nextPrompt !== promptDraft) {
      patch.prompt = nextPrompt;
      setPromptDraft(nextPrompt);
    }

    if (movedPrompts.negativePrompt !== negativePromptDraft) {
      patch.negativePrompt = movedPrompts.negativePrompt;
      setNegativePromptDraft(movedPrompts.negativePrompt);
      setIsNegativePromptVisible(false);
    }

    if (!areStringArraysEqual(nextTags, tagDrafts)) {
      patch.tags = nextTags;
      setTagDrafts(nextTags);
    }

    setAnalysisResult(visibleAnalysis);
    setAnalysisSourceLabel(result.source === "remote" ? "远程 AI" : "本地分析");
    window.setTimeout(() => saveAnalysisParametersToLexicon(visibleAnalysis), 0);

    if (Object.keys(patch).length > 0) {
      void onSave(patch);
    }
  }

  async function analyzeCurrentPromptParameters() {
    if (isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isAnalyzing) {
      return;
    }

    setAnalyzingTarget("prompt");

    try {
      await applyPromptAnalysisToDraft(promptDraft, negativePromptDraft);
    } finally {
      setAnalyzingTarget(null);
    }
  }

  async function optimizeCurrentPrompt() {
    if (isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isAnalyzing) {
      return;
    }

    setIsOptimizingPrompt(true);

    try {
      const optimizedPrompt = await onOptimizePrompt({
        ...toAiActionPayloadSelection("prompt-optimization"),
        prompt: promptDraft,
      });

      if (!optimizedPrompt) {
        return;
      }

      const optimizedPromptDraft = optimizedPrompt.trim();

      if (!optimizedPromptDraft) {
        return;
      }

      setAnalysisResult(null);
      setAnalysisSourceLabel("");
      setActiveCapsule(null);
      setGeneratedCapsuleOptions({});

      const splitPrompts = splitNegativePromptFromPrompt(optimizedPromptDraft, negativePromptDraft, {
        title: titleDraft,
        tags: tagDrafts,
        currentCategory: savedCategory,
        knownCategories,
      });
      const nextPrompt = splitPrompts.prompt;
      const nextNegativePrompt = splitPrompts.negativePrompt;
      const promptChangedByOptimization = nextPrompt !== promptDraft || nextNegativePrompt !== negativePromptDraft;

      if (promptChangedByOptimization) {
        rememberPromptUndoSnapshot();
      }

      if (nextPrompt !== promptDraft) {
        setPromptDraft(nextPrompt);
      }

      if (nextNegativePrompt !== negativePromptDraft) {
        setNegativePromptDraft(nextNegativePrompt);
        setIsNegativePromptVisible(false);
      }

      if (promptChangedByOptimization) {
        const patch: PromptDetailSavePatch = {};

        if (nextPrompt !== item.prompt) {
          patch.prompt = nextPrompt;
        }

        if (nextNegativePrompt !== item.negativePrompt) {
          patch.negativePrompt = nextNegativePrompt;
        }

        if (Object.keys(patch).length > 0) {
          void onSave(patch);
        }
      }
    } finally {
      setIsOptimizingPrompt(false);
    }
  }

  async function translateCurrentPrompt(targetLanguage: PromptLanguageVersion = targetTranslationLanguage): Promise<boolean> {
    if (isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isAnalyzing) {
      return false;
    }

    const sourcePrompt = promptDraft.trim();
    const sourceNegativePrompt = negativePromptDraft.trim();

    if (!sourcePrompt && !sourceNegativePrompt) {
      return false;
    }

    setIsTranslatingPrompt(true);

    try {
      const translatedPrompt = await onTranslatePrompt({
        ...toAiActionPayloadSelection("prompt-translation"),
        negativePrompt: sourceNegativePrompt,
        prompt: sourcePrompt,
        sourceLanguage: sourcePromptLanguage,
        targetLanguage,
      });

      if (!translatedPrompt) {
        return false;
      }

      const nextTranslation: PromptTranslationDraft = {
        language: targetLanguage,
        negativePrompt: translatedPrompt.negativePrompt.trim(),
        prompt: translatedPrompt.prompt.trim(),
      };

      if (!nextTranslation.prompt && !nextTranslation.negativePrompt) {
        return false;
      }

      setPromptTranslationDraft(nextTranslation);
      setPromptLanguageVersion(targetLanguage);
      setIsPromptEditing(false);
      return true;
    } finally {
      setIsTranslatingPrompt(false);
    }
  }

  function updateActivePromptDraft(value: string) {
    if (isViewingTranslatedPrompt && promptTranslationDraft) {
      setPromptTranslationDraft({ ...promptTranslationDraft, prompt: value });
      return;
    }

    setPromptDraft(value);
  }

  function updateActiveNegativePromptDraft(value: string) {
    if (isViewingTranslatedPrompt && promptTranslationDraft) {
      setPromptTranslationDraft({ ...promptTranslationDraft, negativePrompt: value });
      return;
    }

    setNegativePromptDraft(value);
  }

  function switchPromptLanguageVersion(language: PromptLanguageVersion) {
    if (language === promptLanguageVersion) {
      return;
    }

    if (language === sourcePromptLanguage) {
      setPromptLanguageVersion(language);
      setIsPromptEditing(false);
      return;
    }

    if (promptTranslationDraft?.language === language) {
      setPromptLanguageVersion(language);
      setIsPromptEditing(false);
      return;
    }

    void translateCurrentPrompt(language);
  }

  async function reverseCurrentImagePrompt() {
    if (isReversingImagePrompt || isOptimizingPrompt || isTranslatingPrompt || isAnalyzing) {
      return;
    }

    setIsReversingImagePrompt(true);

    try {
      const reversedPrompt = await onReverseImagePrompt({
        ...toAiActionPayloadSelection("image-reverse"),
        imageFileName: item.imageFileName,
      });

      if (!reversedPrompt) {
        return;
      }

      const nextPrompt = reversedPrompt.trim();

      if (!nextPrompt || nextPrompt === promptDraft) {
        return;
      }

      rememberPromptUndoSnapshot();
      setPromptDraft(nextPrompt);
      setAnalysisResult(null);
      setAnalysisSourceLabel("");
      setActiveCapsule(null);
      setGeneratedCapsuleOptions({});
      void onSave({ prompt: nextPrompt });
    } finally {
      setIsReversingImagePrompt(false);
    }
  }

  function addTagFromInput() {
    const tag = newTagDraft.trim();

    if (!tag || categoryChips.some((category) => isSameLabel(category, tag))) {
      setNewTagDraft("");
      return;
    }

    const nextTags = addTags(visibleTagDrafts, [tag]).slice(0, maxAiTagCount);
    setNewTagDraft("");
    commitVisibleTags(nextTags);
  }

  function removeTag(tag: string) {
    commitVisibleTags(visibleTagDrafts.filter((itemTag) => itemTag !== tag));
  }

  function renameTag(originalTag: string, nextValue: string) {
    const nextTag = nextValue.trim();
    const withoutOriginalTag = visibleTagDrafts.filter((tag) => tag !== originalTag);
    const nextTags = nextTag && !categoryChips.some((category) => isSameLabel(category, nextTag))
      ? addTags(withoutOriginalTag, [nextTag]).slice(0, maxAiTagCount)
      : withoutOriginalTag;

    setEditingChip(null);
    commitVisibleTags(nextTags);
  }

  function openPromptCapsuleMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    capsule: Omit<ActivePromptCapsule, "label" | "menuPosition">,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 352;
    const menuHeight = 500;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - menuWidth - 16));
    const top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 16));

    setActiveCapsule({
      ...capsule,
      label: getPromptCapsuleLabel(capsule.variable, analysisResult),
      menuPosition: { left, top },
    });
  }

  function saveAnalysisParametersToLexicon(analysis: PromptAnalysisResult | null) {
    if (!analysis) {
      return;
    }

    const result = mergePromptAnalysisParametersIntoLexicon(localPromptLexicons, analysis, tagDrafts, {
      sourcePromptId: item.id,
      sourcePromptTitle: titleDraft || item.title,
    });

    if (result.addedCount === 0) {
      return;
    }

    setLocalPromptLexicons(result.promptLexicons);
    void onSavePromptLexicons(result.promptLexicons);
  }

  function savePromptParameterValuesToLexicon(values: readonly PromptParameterLexiconValue[]) {
    const result = mergePromptParameterValuesIntoLexicon(localPromptLexicons, values, tagDrafts, {
      sourcePromptId: item.id,
      sourcePromptTitle: titleDraft || item.title,
    });

    if (result.addedCount === 0) {
      return;
    }

    setLocalPromptLexicons(result.promptLexicons);
    void onSavePromptLexicons(result.promptLexicons);
  }

  function replaceActiveCapsuleValue(nextValue: string) {
    if (!activeCapsule) {
      return;
    }

    const normalizedValue = nextValue.trim();

    if (!normalizedValue) {
      return;
    }

    if (activeCapsule.field === "prompt") {
      const nextPrompt = replacePromptTemplateParameterValue(
        promptDraft,
        activeCapsule.parameterIndex,
        activeCapsule.variable,
        normalizedValue,
      );
      const savedCapsuleAnalysis = buildSavedCapsuleAnalysis(item, nextPrompt, negativePromptDraft, knownCategories);

      if (nextPrompt === promptDraft) {
        setActiveCapsule(null);
        return;
      }

      rememberPromptUndoSnapshot();
      setPromptDraft(nextPrompt);
      setAnalysisResult(savedCapsuleAnalysis);
      setAnalysisSourceLabel(savedCapsuleAnalysis ? "已保存" : "");
      void onSave({ prompt: nextPrompt });
    } else {
      const nextNegativePrompt = replacePromptTemplateParameterValue(
        negativePromptDraft,
        activeCapsule.parameterIndex,
        activeCapsule.variable,
        normalizedValue,
      );
      const savedCapsuleAnalysis = buildSavedCapsuleAnalysis(item, promptDraft, nextNegativePrompt, knownCategories);

      if (nextNegativePrompt === negativePromptDraft) {
        setActiveCapsule(null);
        return;
      }

      rememberPromptUndoSnapshot();
      setNegativePromptDraft(nextNegativePrompt);
      setAnalysisResult(savedCapsuleAnalysis);
      setAnalysisSourceLabel(savedCapsuleAnalysis ? "已保存" : "");
      void onSave({ negativePrompt: nextNegativePrompt });
    }

    setGeneratedCapsuleOptions((current) => ({
      ...current,
      [normalizeVariableKey(activeCapsule.variable)]: addUniqueValues(
        current[normalizeVariableKey(activeCapsule.variable)] ?? [],
        [normalizedValue],
      ),
    }));
    savePromptParameterValuesToLexicon([
      {
        label: activeCapsule.label,
        value: normalizedValue,
        variable: activeCapsule.variable,
      },
    ]);
    setActiveCapsule(null);
  }

  async function generateAiCapsuleOptions() {
    if (!activeCapsule || isGeneratingCapsuleOptions) {
      return;
    }

    setIsGeneratingCapsuleOptions(true);

    try {
      const result = await onAnalyzePrompt({
        target: "prompt-options",
        ...toAiActionPayloadSelection("prompt-options"),
        title: titleDraft,
        prompt: promptDraft,
        negativePrompt: negativePromptDraft,
        tags: tagDrafts,
        category: savedCategory,
        knownCategories,
        optionVariable: activeCapsule.variable,
        optionLabel: activeCapsule.label,
        optionValue: activeCapsule.value,
      });
      const values = result.analysis.sections
        .filter((section) => isSameVariable(section.variable, activeCapsule.variable))
        .flatMap((section) => section.values);
      const filteredValues = filterPromptOptionValues({
        variable: activeCapsule.variable,
        values,
        currentValue: activeCapsule.value,
      });
      const optionKey = normalizeVariableKey(activeCapsule.variable);
      const nextGeneratedValues = buildGeneratedPromptOptionValues({
        prompt: promptDraft,
        optionLabel: activeCapsule.label,
        optionValue: activeCapsule.value,
        optionVariable: activeCapsule.variable,
        values: filteredValues,
      });

      setGeneratedCapsuleOptions((current) => ({
        ...current,
        [optionKey]: addUniqueValues(current[optionKey] ?? [], nextGeneratedValues),
      }));
    } finally {
      setIsGeneratingCapsuleOptions(false);
    }
  }

  function handleVideoRef(element: HTMLVideoElement | null) {
    videoRef.current = element;

    if (!element) {
      return;
    }

    element.volume = getStoredVideoVolume();
    element.muted = getStoredVideoMuted();
  }

  const activeCapsuleOptions = activeCapsule
    ? (() => {
        const lexiconValueScopes = getPromptParameterLexiconValueScopes(
          localPromptLexicons,
          activeCapsule.variable,
          item.id,
        );

        return collectPromptCapsuleOptionGroups({
          capsule: activeCapsule,
          analysis: analysisResult,
          generatedValues: generatedCapsuleOptions[normalizeVariableKey(activeCapsule.variable)] ?? [],
          currentPromptLexiconValues: lexiconValueScopes.currentPrompt,
          globalLexiconValues: lexiconValueScopes.global,
          otherPromptLexiconValues: lexiconValueScopes.otherPrompts,
          prompt: promptDraft,
        });
      })()
    : [];

  return (
    <AppDialog
      overlayClassName="z-40 p-3 min-[920px]:p-5"
      panelClassName="grid max-h-[94vh] w-full max-w-[1840px] min-[980px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[980px]:grid-rows-[minmax(0,94vh)]"
      onClose={onClose}
    >
        <div
          className={`relative flex min-h-[360px] min-w-0 flex-col overflow-y-auto bg-panel px-4 py-3 min-[980px]:min-h-[84vh] min-[980px]:border-r min-[980px]:border-border min-[980px]:px-6 ${
            isCurrentMediaLandscape ? "min-[980px]:justify-center min-[980px]:py-4" : "min-[980px]:py-6"
          }`}
        >
          <div
            className={`relative flex w-full flex-col items-center ${
              isCurrentMediaVideo ? "mx-auto gap-4" : "m-auto justify-center gap-4"
            }`}
          >
            <div className="flex max-h-full w-full items-center justify-center px-1 min-[980px]:px-4" ref={detailImageAreaRef}>
              <div
                className={`relative inline-flex cursor-zoom-in items-center justify-center overflow-hidden ${
                  useFixedDetailImageBox
                    ? ""
                    : `max-h-[80vh] ${isCurrentMediaLandscape ? "w-full" : "w-fit"} max-w-full min-[980px]:max-w-full`
                }`}
                style={
                  useFixedDetailImageBox && detailImageBox
                    ? { width: `${detailImageBox.width}px`, height: `${detailImageBox.height}px` }
                    : undefined
                }
                onDoubleClick={() => item.imageFileName && !isCurrentMediaVideo && setIsMediaFullscreen(true)}
              >
                {item.imageFileName ? (
                  isCurrentMediaVideo ? (
                    <video
                      aria-label={titleDraft || "提示词效果视频"}
                       className={`block object-contain shadow-image ${
                         isCurrentMediaLandscape ? "h-auto w-full max-h-[62vh] max-w-full" : "max-h-[78vh] max-w-full"
                       } ${
                         shouldBlurCurrentMedia ? "scale-[1.03] blur-2xl" : ""
                       }`}
                      controls
                      playsInline
                      preload="metadata"
                       ref={handleVideoRef}
                       src={currentMediaSrc}
                       onLoadedMetadata={(event) => {
                         const { videoHeight, videoWidth } = event.currentTarget;
                         if (videoWidth > 0 && videoHeight > 0) {
                           setVideoOrientation(videoWidth > videoHeight ? "landscape" : "portrait");
                         }
                       }}
                      onVolumeChange={(event) => {
                        storeVideoVolume(event.currentTarget.volume);
                        storeVideoMuted(event.currentTarget.muted);
                      }}
                    />
                  ) : (
                    <NsfwImage
                      alt={titleDraft || "提示词效果图"}
                      blurNsfwImages={blurNsfwImages}
                      className={useFixedDetailImageBox ? "h-full w-full" : "max-h-[80vh] max-w-full"}
                      image={item}
                      imageClassName={
                        useFixedDetailImageBox
                          ? "block h-full w-full object-contain shadow-image"
                          : "block max-h-[80vh] max-w-full object-contain shadow-image"
                      }
                      revealed={isCurrentImageRevealed}
                      showRevealControl={false}
                      source={detailImageSource}
                    />
                  )
                ) : (
                  <div className="flex aspect-square w-full max-w-[460px] items-center justify-center rounded-md border border-border text-muted">
                    <ImageIcon size={54} />
                  </div>
                )}
              </div>
            </div>

            {isCurrentMediaVideo ? (
              <div className="w-full">
                <VideoDetailSection
                  isBusy={isBusy}
                  item={item}
                  onGenerateVideoFrames={onGenerateVideoFrames}
                  onImportVideoReferenceImages={onImportVideoReferenceImages}
                  onImportClipboardReferenceImage={onImportClipboardReferenceImage}
                  onImportReferenceImageFromUrl={onImportReferenceImageFromUrl}
                  onDeleteReferenceImage={onDeleteVideoReferenceImage}
                  onPreviewMedia={(imageFileName: string) => setReferenceImagePreview(imageFileName)}
                />
              </div>
            ) : null}

            {canNavigate ? (
              <>
                <ImageNavButton ariaLabel="上一张效果图" direction="left" onClick={onNavigatePrevious} />
                <ImageNavButton ariaLabel="下一张效果图" direction="right" onClick={onNavigateNext} />
              </>
            ) : null}
          </div>

          <div
            className={`group/image-actions z-20 flex min-h-10 shrink-0 items-end ${
              isCurrentMediaVideo
                ? isCurrentMediaLandscape
                  ? "absolute inset-x-4 bottom-4 min-[980px]:inset-x-6"
                  : "relative mt-1 w-full"
                : "absolute inset-x-4 bottom-6 min-h-24 min-[980px]:inset-x-6"
            }`}
          >
            <div
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-full border border-border bg-panel/90 px-3 py-2 shadow-elevated backdrop-blur transition-all duration-200 group-hover/image-actions:-translate-y-1 group-hover/image-actions:opacity-100 group-focus-within/image-actions:-translate-y-1 group-focus-within/image-actions:opacity-100 ${
                isDeleteConfirmOpen ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {isAuthorEditing ? (
                  <AuthorEditForm
                    authorNameDraft={authorNameDraft}
                    authorUrlDraft={authorUrlDraft}
                    onCancel={cancelAuthorEditing}
                    onChangeName={setAuthorNameDraft}
                    onChangeUrl={setAuthorUrlDraft}
                    onSubmit={commitAuthor}
                  />
                ) : item.author && !isAuthorHidden ? (
                  <AuthorChip
                    author={item.author}
                    authorAvatarUrl={item.authorAvatarUrl}
                    authorUrl={item.authorUrl}
                    sourceUrl={item.sourceUrl}
                    onEdit={() => setIsAuthorEditing(true)}
                    onHide={() => setIsAuthorHidden(true)}
                  />
                ) : null}
                <IconTooltipButton
                  ariaLabel={isCurrentMediaVideo ? "视频不支持复制到剪贴板" : "复制图片到剪贴板"}
                  disabled={isBusy || !item.imageFileName || isCurrentMediaVideo}
                  icon={<Copy size={14} />}
                  label={isCurrentMediaVideo ? "视频不支持复制到剪贴板" : "复制图片到剪贴板"}
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="subtle"
                  onClick={onCopyImage}
                />
                <IconTooltipButton
                  ariaLabel={isCurrentMediaVideo ? "导出视频到本地" : "导出图片到本地"}
                  disabled={isBusy || !item.imageFileName}
                  icon={<Download size={14} />}
                  label={isCurrentMediaVideo ? "导出视频到本地" : "导出图片到本地"}
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="subtle"
                  onClick={onExportImage}
                />
              </div>

              <div className="relative flex min-w-0 flex-wrap items-center justify-end gap-2" ref={deleteActionRef}>
                {shouldShowNsfwRevealAction ? (
                  <IconTooltipButton
                    active={isCurrentImageRevealed}
                    ariaLabel={isCurrentImageRevealed ? "恢复模糊" : "显示图像"}
                    icon={isCurrentImageRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    label={isCurrentImageRevealed ? "恢复模糊" : "显示图像"}
                    pressed={isCurrentImageRevealed}
                    size="md"
                    tooltipAlign="center"
                    tooltipPlacement="below"
                    variant="subtle"
                    onClick={() =>
                      setRevealedNsfwImageIds((currentIds) => {
                        const nextIds = new Set(currentIds);
                        if (nextIds.has(item.id)) {
                          nextIds.delete(item.id);
                        } else {
                          nextIds.add(item.id);
                        }
                        return nextIds;
                      })
                    }
                  />
                ) : null}
                <IconTooltipButton
                  ariaLabel="本地导入"
                  disabled={isBusy}
                  icon={<ImagePlus size={14} />}
                  label="本地导入"
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="subtle"
                  onClick={onImportImages}
                />
                <IconTooltipButton
                  ariaLabel="剪贴板"
                  disabled={isBusy}
                  icon={<Clipboard size={14} />}
                  label="剪贴板"
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="subtle"
                  onClick={onImportClipboardImage}
                />
                <IconTooltipButton
                  active={isImageLiked}
                  ariaLabel={isImageLiked ? "取消喜爱图片" : "喜爱"}
                  disabled={isBusy}
                  icon={<Heart size={14} fill={isImageLiked ? "currentColor" : "none"} />}
                  label={isImageLiked ? "取消喜爱图片" : "喜爱"}
                  pressed={isImageLiked}
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="danger"
                  onClick={onToggleImageLike}
                />
                <IconTooltipButton
                  ariaLabel="删除"
                  disabled={isBusy}
                  icon={<Trash2 size={14} />}
                  label="删除"
                  size="md"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="danger"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                />
                {canNavigate ? (
                  <span className="rounded-full border border-border bg-panel/60 px-2.5 py-1 text-xs text-muted/75">
                    {currentIndexText}
                  </span>
                ) : null}
                {isDeleteConfirmOpen ? (
                  <ConfirmBubble
                    className="bottom-full right-0 mb-3"
                    confirmLabel="确认删除"
                    description="将删除这张图和对应提示词，无法撤销。"
                    icon={<Trash2 size={15} />}
                    isBusy={isBusy}
                    title="删除这张效果图？"
                    onCancel={() => setIsDeleteConfirmOpen(false)}
                    onConfirm={() => {
                      setIsDeleteConfirmOpen(false);
                      onDelete();
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col bg-panel px-5 py-4 min-[980px]:max-h-[94vh] min-[980px]:px-7 min-[980px]:py-5">
          <header
            className={`group/detail-card relative shrink-0 overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${detailInfoCardTone.article}`}
          >
            <div className={`flex min-h-11 items-center justify-between gap-3 border-b px-3 py-2 ${detailInfoCardTone.header}`}>
              <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-current">
                <FileText size={15} />
                <span className="truncate">素材详情</span>
              </span>
              <button
                aria-label="关闭详情"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-panel/80 text-current outline-none transition-all hover:-translate-y-0.5 hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/25"
                type="button"
                onClick={onClose}
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid gap-3 px-3 py-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[11px] font-semibold ${detailInfoCardTone.tag}`}>
                  {sourceLabel}
                </span>
                <div className="relative max-w-full">
                  <button
                    aria-expanded={isModelMenuOpen}
                    aria-haspopup="listbox"
                    aria-label={`切换模型：${modelLabel ?? "未设置模型"}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                    ref={modelButtonRef}
                    title="切换模型"
                    type="button"
                    onClick={() => setIsModelMenuOpen((current) => !current)}
                  >
                    <span className="min-w-0 truncate">模型：{modelLabel ?? "未设置模型"}</span>
                    <ChevronDown size={11} />
                  </button>
                  {isModelMenuOpen ? (
                    <ModelSwitchMenu
                      activeModel={modelLabel}
                      menuRef={modelMenuRef}
                      options={modelOptions}
                      search={modelSearch}
                      canSort={!modelSearch.trim()}
                      onClear={() => commitModel(null)}
                      onClose={() => setIsModelMenuOpen(false)}
                      onDelete={hideModelOption}
                      onReorder={moveModelOption}
                      onSearchChange={setModelSearch}
                      onSelect={commitModel}
                    />
                  ) : null}
                </div>
                <PromptTypeSwitch value={savedPromptType} onChange={commitPromptType} />
                {item.sourceUrl ? (
                  <a
                    aria-label={`打开来源链接：${formatCompactUrl(item.sourceUrl)}`}
                    className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                    href={item.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                    title={item.sourceUrl}
                  >
                    <ExternalLink size={11} />
                    <span className="min-w-0 truncate">{formatCompactUrl(item.sourceUrl)}</span>
                  </a>
                ) : null}
              </div>

              <input
                aria-label="编辑标题"
                className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-2xl font-semibold leading-tight text-foreground outline-none transition-colors focus:border-border focus:bg-background focus:px-3 focus:ring-2 focus:ring-primary/20"
                value={titleDraft}
                onBlur={commitTitle}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>

            {moduleNoticeText ? (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground">
                <AlertCircle size={14} className="shrink-0 text-warning" />
                <span>{moduleNoticeText}</span>
              </div>
            ) : null}

            {!isPromptEditing ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">分类</span>
                    <IconTooltipButton
                      data-ai-profile-trigger="true"
                      disabled={isAnalyzing || isBusy}
                      icon={<Sparkles size={14} />}
                      label={
                        analyzingTarget === getRecognitionAction("category", recognitionSourceByKind.category)
                          ? "识别中"
                          : "识别分类"
                      }
                      size="sm"
                      tooltipAlign="center"
                      tooltipPlacement="below"
                      variant="panel"
                      onContextMenu={(event) =>
                        openAiProfileMenu(
                          event,
                          getRecognitionAction("category", recognitionSourceByKind.category),
                          "category",
                        )
                      }
                      onClick={() => void recognizeCategory()}
                    />
                  </div>
                  <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {categoryChips.length > 0 ? (
                      categoryChips.map((category) => (
                        <CompactChip
                          active={isSameLabel(category, savedCategory)}
                          editingValue={
                            editingChip?.kind === "category" && isSameLabel(editingChip.originalValue, category)
                              ? editingChip.value
                              : ""
                          }
                          isEditing={editingChip?.kind === "category" && isSameLabel(editingChip.originalValue, category)}
                          key={category}
                          label={category}
                          removeLabel={`取消分类 ${category}`}
                          onCancelEdit={() => setEditingChip(null)}
                          onCommitEdit={(nextValue) => renameCategoryChip(category, nextValue)}
                          onEditValueChange={(value) =>
                            setEditingChip({ kind: "category", originalValue: category, value })
                          }
                          onStartEdit={() =>
                            setEditingChip({ kind: "category", originalValue: category, value: category })
                          }
                          onRemove={() => removeCategoryChip(category)}
                        />
                      ))
                    ) : (
                      <span className="inline-flex min-h-6 items-center rounded-full border border-border bg-background px-2 text-[11px] leading-5 text-muted">
                        未分类
                      </span>
                    )}
                    <label
                      className="group inline-flex min-h-6 max-w-full items-center gap-0 rounded-full border border-border bg-background px-2 text-[11px] leading-5 text-muted transition-transform duration-150 hover:scale-[1.03] hover:bg-primary-soft hover:text-foreground focus-within:gap-1 focus-within:scale-[1.03]"
                      title="添加分类"
                    >
                      <Plus size={12} />
                      <input
                        aria-label="添加分类"
                        className={`min-w-0 bg-transparent text-[11px] text-foreground outline-none transition-[width] duration-150 ${
                          categoryDraft ? "w-16" : "w-0 focus:w-16"
                        }`}
                        value={categoryDraft}
                        onBlur={addCategoryFromInput}
                        onChange={(event) => setCategoryDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCategoryFromInput();
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">标签</span>
                    <IconTooltipButton
                      data-ai-profile-trigger="true"
                      disabled={isAnalyzing || isBusy}
                      icon={<Sparkles size={14} />}
                      label={
                        analyzingTarget === getRecognitionAction("tags", recognitionSourceByKind.tags)
                          ? "识别中"
                          : "识别标签"
                      }
                      size="sm"
                      tooltipAlign="center"
                      tooltipPlacement="below"
                      variant="panel"
                      onContextMenu={(event) =>
                        openAiProfileMenu(event, getRecognitionAction("tags", recognitionSourceByKind.tags), "tags")
                      }
                      onClick={() => void recognizeTags()}
                    />
                  </div>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {visibleTagDrafts.length > 0 ? (
                      visibleTagDrafts.map((tag) => (
                        <CompactChip
                          key={tag}
                          editingValue={editingChip?.kind === "tag" && editingChip.originalValue === tag ? editingChip.value : ""}
                          isEditing={editingChip?.kind === "tag" && editingChip.originalValue === tag}
                          label={tag}
                          removeLabel={`删除标签 ${tag}`}
                          onCancelEdit={() => setEditingChip(null)}
                          onCommitEdit={(nextValue) => renameTag(tag, nextValue)}
                          onEditValueChange={(value) => setEditingChip({ kind: "tag", originalValue: tag, value })}
                          onStartEdit={() => setEditingChip({ kind: "tag", originalValue: tag, value: tag })}
                          onRemove={() => removeTag(tag)}
                        />
                      ))
                    ) : (
                      <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted">
                        暂无标签
                      </span>
                    )}
                    <label
                      className="group inline-flex min-h-6 max-w-full items-center gap-0 rounded-full border border-border bg-background px-2 text-[11px] leading-5 text-muted transition-transform duration-150 hover:scale-[1.03] hover:bg-primary-soft hover:text-foreground focus-within:gap-1 focus-within:scale-[1.03]"
                      title="添加标签"
                    >
                      <Plus size={12} />
                      <input
                        aria-label="添加标签"
                        className={`min-w-0 bg-transparent text-[11px] text-foreground outline-none transition-[width] duration-150 ${
                          newTagDraft ? "w-20" : "w-0 focus:w-20"
                        }`}
                        value={newTagDraft}
                        onBlur={addTagFromInput}
                        onChange={(event) => setNewTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addTagFromInput();
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </header>

          <section
            className={`group/detail-card relative mt-4 flex min-h-[460px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${detailPromptCardTone.article}`}
          >
            <div className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2 ${detailPromptCardTone.header}`}>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-current">
                <Tags size={15} />
                提示词
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!isCurrentMediaVideo ? (
                  <div className="relative">
                    <IconTooltipButton
                      ariaLabel="添加参考图"
                      icon={<ImagePlus size={14} />}
                      label="添加参考图"
                      size="sm"
                      tooltipAlign="center"
                      tooltipPlacement="below"
                      variant="panel"
                      onClick={() => setIsReferenceImagePopoverOpen((open) => !open)}
                    />
                  </div>
                ) : null}
                <PromptLanguageSwitch
                  value={promptLanguageVersion}
                  onChange={switchPromptLanguageVersion}
                />
                <IconTooltipButton
                  data-ai-profile-trigger="true"
                  ariaLabel={isTranslatingPrompt ? "翻译中" : `翻译为${getPromptLanguageLabel(targetTranslationLanguage)}`}
                  disabled={isAnalyzing || isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isBusy}
                  icon={<Languages size={14} />}
                  label={isTranslatingPrompt ? "翻译中" : `翻译为${getPromptLanguageLabel(targetTranslationLanguage)}`}
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onContextMenu={(event) => openAiProfileMenu(event, "prompt-translation")}
                  onClick={() => void translateCurrentPrompt(targetTranslationLanguage)}
                />
                <IconTooltipButton
                  active={isPromptEditing}
                  icon={isPromptEditing ? <Check size={14} /> : <Pencil size={14} />}
                  label={isPromptEditing ? "完成" : "编辑"}
                  pressed={isPromptEditing}
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onClick={() => {
                    if (isPromptEditing) {
                      if (!isViewingTranslatedPrompt) {
                        commitPrompt();
                      }
                      setIsPromptEditing(false);
                      return;
                    }

                    startPromptEditing();
                  }}
                />
                <IconTooltipButton
                  ariaLabel="撤回上一步"
                  disabled={isBusy || isViewingTranslatedPrompt || !canUndoPromptChange}
                  icon={<Undo2 size={14} />}
                  label="撤回上一步"
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={undoPromptChange}
                />
                <IconTooltipButton
                  data-ai-profile-trigger="true"
                  ariaLabel={isOptimizingPrompt ? "优化中" : "优化提示词"}
                  disabled={isViewingTranslatedPrompt || isAnalyzing || isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isBusy}
                  icon={<WandSparkles size={14} />}
                  label={isOptimizingPrompt ? "优化中" : "优化提示词"}
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onContextMenu={(event) => openAiProfileMenu(event, "prompt-optimization")}
                  onClick={() => void optimizeCurrentPrompt()}
                />
                <IconTooltipButton
                  data-ai-profile-trigger="true"
                  ariaLabel={analyzingTarget === "prompt" ? "生成胶囊中" : "参数分析"}
                  disabled={isViewingTranslatedPrompt || isAnalyzing || isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isBusy}
                  icon={<Sparkles size={14} />}
                  label={analyzingTarget === "prompt" ? "生成胶囊中" : "参数分析"}
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onContextMenu={(event) => openAiProfileMenu(event, "prompt")}
                  onClick={() => void analyzeCurrentPromptParameters()}
                />
                <IconTooltipButton
                  data-ai-profile-trigger="true"
                  ariaLabel={isReversingImagePrompt ? "反推中" : "图像反推"}
                  disabled={isViewingTranslatedPrompt || isAnalyzing || isOptimizingPrompt || isTranslatingPrompt || isReversingImagePrompt || isBusy}
                  icon={<ScanSearch size={14} />}
                  label={isReversingImagePrompt ? "反推中" : "图像反推"}
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onContextMenu={(event) => openAiProfileMenu(event, "image-reverse")}
                  onClick={() => void reverseCurrentImagePrompt()}
                />
                <IconTooltipButton
                  ariaLabel="清除胶囊"
                  disabled={isBusy || isViewingTranslatedPrompt || !hasPromptCapsules}
                  icon={<Eraser size={14} />}
                  label="清除胶囊"
                  size="sm"
                  tooltipAlign="center"
                  tooltipPlacement="below"
                  variant="panel"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearPromptCapsules}
                />
                <span className="text-xs text-current/70">{copyPromptText.length} 字符</span>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              {!isCurrentMediaVideo ? (
                <ReferenceImageFloatingStrip
                  deletingImageFileName={deletingReferenceImage}
                  referenceImages={item.videoReferenceImages ?? []}
                  onDelete={(imageFileName) => void handleDeleteReferenceImage(imageFileName)}
                  onPreview={(imageFileName) => setReferenceImagePreview(imageFileName)}
                />
              ) : null}
              <div
                className={`${isPromptEditing ? "min-h-[520px]" : "min-h-[420px]"} h-full overflow-y-auto bg-background p-3`}
              >
              {isPromptEditing ? (
                <div
                  className="grid gap-4"
                  onBlur={(event) => {
                    const nextFocusTarget = event.relatedTarget;

                    if (nextFocusTarget instanceof Node && event.currentTarget.contains(nextFocusTarget)) {
                      return;
                    }

                    if (!isViewingTranslatedPrompt) {
                      commitPrompt();
                    }
                    setIsPromptEditing(false);
                  }}
                >
                  <label className="grid gap-2 text-xs font-medium text-muted">
                    正向提示词
                    <TextArea
                      ref={promptTextAreaRef}
                      className={`${
                        hasActiveNegativePromptDraft ? "min-h-[500px]" : "min-h-[620px]"
                      } border-transparent bg-transparent p-0 font-mono text-[11px] leading-5 [overflow-wrap:anywhere] focus:border-transparent focus:ring-0`}
                      resizeMode="vertical"
                      value={activePromptDraft}
                      onChange={(event) => updateActivePromptDraft(event.target.value)}
                    />
                  </label>
                  {hasActiveNegativePromptDraft ? (
                    <div
                      className={`rounded-md border border-border bg-panel text-xs font-medium text-muted ${
                        isNegativePromptVisible ? "grid gap-2 px-3 py-3" : "px-3 py-2"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>负向提示词</span>
                        <button
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setIsNegativePromptVisible((current) => !current)}
                        >
                          {isNegativePromptVisible ? "隐藏" : "查看"}
                        </button>
                      </span>
                      {isNegativePromptVisible ? (
                        <TextArea
                          aria-label="编辑负向提示词"
                          className="min-h-[160px] border-transparent bg-transparent p-0 font-mono text-[11px] leading-5 [overflow-wrap:anywhere] focus:border-transparent focus:ring-0"
                          resizeMode="vertical"
                          value={activeNegativePromptDraft}
                          onChange={(event) => updateActiveNegativePromptDraft(event.target.value)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <PromptTemplatePreview
                  isNegativePromptVisible={isNegativePromptVisible}
                  negativePrompt={activeNegativePromptDraft}
                  onDoubleClick={startPromptEditing}
                  onOpenCapsule={isViewingTranslatedPrompt ? undefined : openPromptCapsuleMenu}
                  prompt={activePromptDraft}
                  onToggleNegativePrompt={() => setIsNegativePromptVisible((current) => !current)}
                />
              )}
              </div>
            </div>

            {isReferenceImagePopoverOpen && !isCurrentMediaVideo ? (
              <ReferenceImagePopover
                innerRef={referenceImagePopoverRef}
                deletingImageFileName={deletingReferenceImage}
                isImporting={isImportingReferenceImage}
                referenceImages={item.videoReferenceImages ?? []}
                onClose={() => {
                  setIsReferenceImagePopoverOpen(false);
                }}
                onDelete={(imageFileName) => void handleDeleteReferenceImage(imageFileName)}
                onImportFromClipboard={() => void handleImportReferenceImageFromClipboard()}
                onImportFromLocal={() => void handleImportReferenceImageFromLocal()}
                onPreview={(imageFileName) => setReferenceImagePreview(imageFileName)}
              />
            ) : null}

            {analysisResult ? (
              <PromptAnalysisSummary
                analysis={analysisResult}
                sourceLabel={analysisSourceLabel}
              />
            ) : null}
          </section>

          <footer className="mt-4 grid shrink-0 grid-cols-[0.42fr_0.58fr] gap-3 bg-panel pt-3">
            <Button
              className="h-12 rounded-md bg-panel"
              icon={<Share2 size={17} />}
              onClick={() => onShareText(shareText)}
            >
              分享
            </Button>
            <Button
              className="h-12 rounded-md border-progress bg-progress text-primary-foreground hover:bg-progress/90"
              icon={<Copy size={17} />}
              variant="primary"
              onClick={() => onCopyText(copyPromptText)}
            >
              复制提示词
            </Button>
          </footer>
        </aside>

        {activeCapsule ? (
          <PromptCapsuleMenu
            activeValue={activeCapsule.value}
            isGenerating={isGeneratingCapsuleOptions}
            label={activeCapsule.label}
            menuRef={capsuleMenuRef}
            optionGroups={activeCapsuleOptions}
            position={activeCapsule.menuPosition}
            variable={activeCapsule.variable}
            onAddCustom={replaceActiveCapsuleValue}
            onClose={() => setActiveCapsule(null)}
            onGenerateAiOptions={() => void generateAiCapsuleOptions()}
            onOpenAiProfileMenu={(event) => openAiProfileMenu(event, "prompt-options")}
            onSelect={replaceActiveCapsuleValue}
          />
        ) : null}
        {activeAiProfileMenu ? (
          <AiProfileQuickSwitchMenu
            actionLabel={getAiProfileActionLabel(activeAiProfileMenu.action)}
            activeProfileId={aiSettings.activeProfileId}
            capability={getAiProfileActionCapability(activeAiProfileMenu.action)}
            menuRef={aiProfileMenuRef}
            position={activeAiProfileMenu.position}
            profiles={aiSettings.profiles}
            recognitionSource={
              activeAiProfileMenu.recognitionKind
                ? recognitionSourceByKind[activeAiProfileMenu.recognitionKind]
                : undefined
            }
            ruleSelection={resolveAiRuleSelection(activeAiProfileMenu.action)}
            selectedSelection={resolveAiModelSelection(activeAiProfileMenu.action)}
            onClearRules={() => clearAiRuleSelection(activeAiProfileMenu.action)}
            onClose={() => setActiveAiProfileMenu(null)}
            onResetRules={() => resetAiRuleSelection(activeAiProfileMenu.action)}
            onSelectModel={(selection) => selectAiModel(activeAiProfileMenu.action, selection)}
            onSelectSource={
              activeAiProfileMenu.recognitionKind
                ? (source) => selectAiRecognitionSource(activeAiProfileMenu.recognitionKind!, source)
                : undefined
            }
            onToggleRule={(ruleId) => toggleAiRuleSelection(activeAiProfileMenu.action, ruleId)}
          />
        ) : null}

      {isMediaFullscreen && item.imageFileName ? (
        <MediaFullscreenOverlay item={item} onClose={() => setIsMediaFullscreen(false)} />
      ) : null}

      {referenceImagePreview ? (
        <ReferenceImagePreviewOverlay
          imageFileName={referenceImagePreview}
          onClose={() => setReferenceImagePreview(null)}
        />
      ) : null}
    </AppDialog>
  );
}

type PromptAnalysisSummaryProps = {
  analysis: PromptAnalysisResult;
  sourceLabel: string;
};

type PromptTypeSwitchProps = {
  value: PromptContentType;
  onChange: (value: PromptContentType) => void;
};

type PromptLanguageSwitchProps = {
  value: PromptLanguageVersion;
  onChange: (value: PromptLanguageVersion) => void;
};

function PromptLanguageSwitch({ value, onChange }: PromptLanguageSwitchProps) {
  const options: Array<{ label: string; value: PromptLanguageVersion }> = [
    { label: "中文", value: "zh" },
    { label: "英文", value: "en" },
  ];

  return (
    <div className="grid h-8 grid-cols-2 rounded-lg border border-current/20 bg-panel/70 p-0.5 shadow-sm">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={`min-w-11 rounded-md px-2 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:bg-primary-soft hover:text-foreground"
          }`}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PromptTypeSwitch({ value, onChange }: PromptTypeSwitchProps) {
  const options: Array<{ icon: ReactNode; type: PromptContentType }> = [
    { icon: <ImageIcon size={11} />, type: "image" },
    { icon: <Play size={11} />, type: "video" },
  ];

  return (
    <div
      aria-label="选择提示词类型"
      className="inline-flex overflow-hidden rounded-md border border-border bg-background p-0.5"
      role="group"
    >
      {options.map((option) => {
        const active = option.type === value;
        const label = getPromptTypeLabel(option.type);

        return (
          <button
            aria-pressed={active}
            className={`inline-flex min-h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-panel hover:text-foreground"
            }`}
            key={option.type}
            title={`提示词类型：${label}`}
            type="button"
            onClick={() => onChange(option.type)}
          >
            {option.icon}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PromptAnalysisSummary({
  analysis,
  sourceLabel,
}: PromptAnalysisSummaryProps) {
  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-foreground">已生成莫兰迪胶囊</span>
        {sourceLabel ? (
          <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] text-muted">
            {sourceLabel}
          </span>
        ) : null}
        <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] text-muted">
          {analysis.chips.length} 个可替换胶囊
        </span>
        <span>点击胶囊可替换词条。</span>
      </div>
    </div>
  );
}

type AiProfileQuickSwitchMenuProps = {
  actionLabel: string;
  activeProfileId: string;
  capability: "text" | "vision";
  menuRef: RefObject<HTMLDivElement | null>;
  position: { left: number; top: number };
  profiles: PublicAiProviderProfile[];
  recognitionSource?: AiRecognitionSource;
  ruleSelection: AiRuleSelection;
  selectedSelection?: AiModelSelection;
  onClearRules: () => void;
  onClose: () => void;
  onResetRules: () => void;
  onSelectModel: (selection: AiModelSelection) => void;
  onSelectSource?: (source: AiRecognitionSource) => void;
  onToggleRule: (ruleId: string) => void;
};

function AiProfileQuickSwitchMenu({
  actionLabel,
  activeProfileId,
  capability,
  menuRef,
  position,
  profiles,
  recognitionSource,
  ruleSelection,
  selectedSelection,
  onClearRules,
  onClose,
  onResetRules,
  onSelectModel,
  onSelectSource,
  onToggleRule,
}: AiProfileQuickSwitchMenuProps) {
  const selectableProfiles = profiles.filter((profile) => profile.enabled);
  const [activeBranch, setActiveBranch] = useState<"source" | "model" | "rules" | null>(
    () => (recognitionSource ? "source" : null),
  );
  const [activeProviderId, setActiveProviderId] = useState(
    () =>
      selectedSelection?.profileId ??
      (selectableProfiles.some((profile) => profile.id === activeProfileId)
        ? activeProfileId
        : selectableProfiles[0]?.id) ??
      "",
  );
  const activeProvider =
    selectableProfiles.find((profile) => profile.id === activeProviderId) ?? selectableProfiles[0] ?? null;
  const selectedRuleCount = ruleSelection.rulePresetIds.length;

  function handleProviderFocus(profileId: string) {
    setActiveBranch("model");
    setActiveProviderId(profileId);
  }

  return (
    <div
      className="ai-quick-switch fixed z-50 flex max-w-[calc(100vw-2rem)] items-start gap-0"
      ref={menuRef}
      style={{ left: position.left, top: position.top }}
    >
      <div className="ai-quick-switch__panel ai-quick-switch__panel--root">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2 pb-1.5 pt-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">AI 快速设置</p>
            <p className="truncate text-[11px] text-muted">{actionLabel}</p>
          </div>
          <button
            aria-label="关闭 AI 快速设置菜单"
            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
            type="button"
            onClick={onClose}
          >
            <X size={12} />
          </button>
        </div>

        <div className="grid gap-1 pt-1.5">
          {recognitionSource && onSelectSource ? (
            <AiCascadeBranchButton
              active={activeBranch === "source"}
              detail={getAiRecognitionSourceLabel(recognitionSource)}
              icon={recognitionSource === "image" ? <ImageIcon size={14} /> : <FileText size={14} />}
              label="来源"
              onActivate={() => setActiveBranch("source")}
            />
          ) : null}
          <AiCascadeBranchButton
            active={activeBranch === "model"}
            detail={selectedSelection?.modelId ?? "选择服务商"}
            icon={<Sparkles size={14} />}
            label="模型"
            onActivate={() => {
              setActiveBranch("model");
              setActiveProviderId(selectedSelection?.profileId ?? activeProviderId);
            }}
          />
          <AiCascadeBranchButton
            active={activeBranch === "rules"}
            detail={selectedRuleCount > 0 ? `${selectedRuleCount} 条已选` : "选择规则"}
            icon={<FileText size={14} />}
            label="规则"
            onActivate={() => setActiveBranch("rules")}
          />
        </div>
      </div>

      {activeBranch === "source" && recognitionSource && onSelectSource ? (
        <div className="ai-quick-switch__panel ai-quick-switch__panel--source ai-quick-switch__panel--layer-2">
          <div className="border-b border-border/70 px-2 pb-1.5 pt-1">
            <p className="text-xs font-semibold text-foreground">选择分析来源</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">来源决定可选模型和规则</p>
          </div>
          <div className="grid gap-1 pt-1.5">
            {(["image", "prompt"] as const).map((source) => {
              const selected = recognitionSource === source;

              return (
                <button
                  aria-pressed={selected}
                  className={`grid min-h-10 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 rounded-xl px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                    selected ? "bg-primary-soft text-foreground" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                  key={source}
                  type="button"
                  onClick={() => {
                    onSelectSource(source);
                    setActiveBranch("model");
                  }}
                >
                  <span
                    className={`flex size-4 items-center justify-center rounded-full border ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-panel"
                    }`}
                  >
                    {selected ? <Check size={11} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{getAiRecognitionSourceLabel(source)}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {source === "image" ? "图像模型与规则" : "文本模型与规则"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeBranch === "model" ? (
        <div className="ai-quick-switch__panel ai-quick-switch__panel--provider ai-quick-switch__panel--layer-2">
          <div className="border-b border-border/70 px-2 pb-1.5 pt-1">
            <p className="text-xs font-semibold text-foreground">选择服务商</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">先选 API，再选模型</p>
          </div>
          <div className="grid max-h-[calc(100vh-8rem)] gap-1 overflow-y-auto pt-1.5">
            {selectableProfiles.length > 0 ? (
              selectableProfiles.map((profile) => {
                const selectedProvider = selectedSelection?.profileId === profile.id;
                const activeProviderRow = activeProvider?.id === profile.id;
                const ready = isPublicAiProfileReady(profile);
                const usableModelCount = profile.models.filter((model) => model.capabilities.includes(capability)).length;

                return (
                  <button
                    className={`grid min-h-9 grid-cols-[18px_minmax(0,1fr)_14px] items-center gap-1.5 rounded-xl px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                      activeProviderRow
                        ? "bg-primary-soft text-foreground"
                        : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                    key={profile.id}
                    type="button"
                    onClick={() => handleProviderFocus(profile.id)}
                    onMouseEnter={() => handleProviderFocus(profile.id)}
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-full border ${
                        selectedProvider
                          ? "border-primary bg-primary text-primary-foreground"
                          : ready
                            ? "border-muted bg-panel"
                            : "border-border bg-background"
                      }`}
                    >
                      {selectedProvider ? <Check size={11} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{profile.name || "未命名 API"}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {ready ? `${usableModelCount} 个可用模型` : profile.enabled ? "待完善" : "已停用"}
                      </span>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                );
              })
            ) : (
              <p className="rounded-xl border border-border bg-background px-3 py-6 text-center text-xs text-muted">
                还没有已启用的 API
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activeBranch === "model" && activeProvider ? (
        <div className="ai-quick-switch__panel ai-quick-switch__panel--model ai-quick-switch__panel--layer-3">
          <div className="border-b border-border/70 px-2 pb-1.5 pt-1">
            <p className="truncate text-xs font-semibold text-foreground">{activeProvider.name || "未命名 API"}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">选择具体模型</p>
          </div>
          <div className="grid max-h-[calc(100vh-8rem)] gap-1 overflow-y-auto pt-1.5">
            {activeProvider.models.length > 0 ? (
              activeProvider.models.map((model) => {
                const selected =
                  selectedSelection?.profileId === activeProvider.id && selectedSelection.modelId === model.id;
                const ready = isPublicAiProfileReady(activeProvider) && model.capabilities.includes(capability);

                return (
                  <button
                    className={`grid min-h-9 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected ? "bg-primary-soft text-foreground" : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                    disabled={!ready}
                    key={model.id}
                    title={model.id}
                    type="button"
                    onClick={() => onSelectModel({ profileId: activeProvider.id, modelId: model.id })}
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-full border ${
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-panel"
                      }`}
                    >
                      {selected ? <Check size={11} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{model.label || model.id}</span>
                      <span className="block truncate text-[11px] text-muted">{model.id}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <AiModelCapabilityIcons capabilities={model.capabilities} />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="rounded-xl border border-border bg-background px-3 py-6 text-center text-xs text-muted">
                这个服务商还没有模型
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activeBranch === "rules" ? (
        <div className="ai-quick-switch__panel ai-quick-switch__panel--rules ai-quick-switch__panel--layer-2">
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-2 pb-1.5 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">选择规则</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {ruleSelection.isUsingSettings ? "来自模型配置" : "来自快速选择"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                className="rounded-lg border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                type="button"
                onClick={onResetRules}
              >
                恢复
              </button>
              <button
                className="rounded-lg border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                type="button"
                onClick={onClearRules}
              >
                清空
              </button>
            </div>
          </div>
          <div className="grid max-h-[calc(100vh-8rem)] gap-1 overflow-y-auto pt-1.5">
            {ruleSelection.rules.length > 0 ? (
              ruleSelection.rules.map((rule) => {
                const selected = ruleSelection.rulePresetIds.includes(rule.id);

                return (
                  <button
                    aria-pressed={selected}
                    className={`grid min-h-12 grid-cols-[18px_minmax(0,1fr)] items-start gap-1.5 rounded-xl px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                      selected ? "bg-primary-soft text-foreground" : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                    key={rule.id}
                    title={rule.instructions}
                    type="button"
                    onClick={() => onToggleRule(rule.id)}
                  >
                    <span
                      className={`mt-0.5 flex size-4 items-center justify-center rounded-full border ${
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-panel"
                      }`}
                    >
                      {selected ? <Check size={11} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{rule.label}</span>
                      <span className="line-clamp-2 text-[10px] leading-[14px] text-muted">{rule.instructions}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="rounded-xl border border-border bg-background px-3 py-6 text-center text-xs text-muted">
                当前功能还没有可用规则
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type AiCascadeBranchButtonProps = {
  active: boolean;
  detail: string;
  icon: ReactNode;
  label: string;
  onActivate: () => void;
};

function AiCascadeBranchButton({ active, detail, icon, label, onActivate }: AiCascadeBranchButtonProps) {
  return (
    <button
      className={`grid min-h-9 grid-cols-[22px_minmax(0,1fr)_14px] items-center gap-1.5 rounded-xl px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active ? "bg-primary-soft text-foreground" : "text-muted hover:bg-background hover:text-foreground"
      }`}
      type="button"
      onClick={onActivate}
      onMouseEnter={onActivate}
    >
      <span className="flex size-[22px] items-center justify-center rounded-lg border border-border bg-background">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted">{detail}</span>
      </span>
      <ChevronRight size={13} />
    </button>
  );
}

type PromptTemplatePreviewProps = {
  isNegativePromptVisible: boolean;
  negativePrompt: string;
  onDoubleClick: () => void;
  onOpenCapsule?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    capsule: Omit<ActivePromptCapsule, "label" | "menuPosition">,
  ) => void;
  onToggleNegativePrompt: () => void;
  prompt: string;
};

function PromptTemplatePreview({
  isNegativePromptVisible,
  negativePrompt,
  onDoubleClick,
  onOpenCapsule,
  onToggleNegativePrompt,
  prompt,
}: PromptTemplatePreviewProps) {
  const hasPrompt = Boolean(prompt.trim());
  const hasNegativePrompt = Boolean(negativePrompt.trim());

  if (!hasPrompt && !hasNegativePrompt) {
    return <p className="text-xs text-muted">暂无提示词详情。</p>;
  }

  return (
    <div
      className="whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-foreground [overflow-wrap:anywhere]"
      title="双击编辑提示词"
      onDoubleClick={onDoubleClick}
    >
      {hasPrompt ? <PromptTemplateSegments field="prompt" text={prompt} onOpenCapsule={onOpenCapsule} /> : null}
      {hasNegativePrompt ? (
        <div className={hasPrompt ? "mt-4" : ""}>
          <button
            className="inline-flex min-h-7 items-center gap-2 rounded-full border border-border bg-panel px-3 font-sans text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleNegativePrompt();
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {isNegativePromptVisible ? "隐藏负向提示词" : "查看负向提示词"}
          </button>
          {isNegativePromptVisible ? (
            <div className="mt-3 rounded-md border border-border bg-panel px-3 py-3">
              <span className="font-sans text-xs font-medium text-muted">负向提示词：</span>
              <PromptTemplateSegments field="negativePrompt" text={negativePrompt} onOpenCapsule={onOpenCapsule} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PromptTemplateSegments({
  field,
  text,
  onOpenCapsule,
}: {
  field: PromptCapsuleField;
  text: string;
  onOpenCapsule?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    capsule: Omit<ActivePromptCapsule, "label" | "menuPosition">,
  ) => void;
}) {
  let parameterIndex = -1;

  return (
    <>
      {parsePromptTemplateSegments(text).map((segment, index) => {
        if (segment.type !== "parameter") {
          return <span key={`${segment.text}-${index}`}>{segment.text}</span>;
        }

        parameterIndex += 1;
        const currentParameterIndex = parameterIndex;
        const sectionKey = resolvePromptSectionKeyForValue(segment.variable, segment.value);

        if (!sectionKey) {
          return <span key={`${segment.source}-${index}`}>{resolvePromptTemplateText(segment.source)}</span>;
        }

        const capsuleVariable = promptSectionMeta[sectionKey].variable;
        const capsuleValue = normalizePromptSectionValue(sectionKey, segment.value);

        if (!capsuleValue) {
          return <span key={`${segment.source}-${index}`}>{resolvePromptTemplateText(segment.source)}</span>;
        }

        const toneClassName = getPromptCapsuleToneClassName(capsuleVariable);

        if (!onOpenCapsule) {
          return <span key={`${segment.source}-${index}`}>{resolvePromptTemplateText(segment.source)}</span>;
        }

        return (
          <button
            className={`mx-0.5 inline-flex max-w-full translate-y-[1px] items-center rounded-full border px-2 py-0.5 font-sans text-[11px] font-semibold leading-5 shadow-elevated transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${toneClassName}`}
            data-prompt-capsule="true"
            key={`${segment.source}-${index}`}
            title={`参数 ${capsuleVariable}：${capsuleValue}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCapsule(event, {
                field,
                parameterIndex: currentParameterIndex,
                value: capsuleValue,
                variable: capsuleVariable,
              });
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span className="max-w-56 truncate">{capsuleValue}</span>
          </button>
        );
      })}
    </>
  );
}

type PromptCapsuleMenuProps = {
  activeValue: string;
  isGenerating: boolean;
  label: string;
  menuRef: RefObject<HTMLDivElement | null>;
  optionGroups: PromptCapsuleOptionGroup[];
  position: { left: number; top: number };
  variable: string;
  onAddCustom: (value: string) => void;
  onClose: () => void;
  onGenerateAiOptions: () => void;
  onOpenAiProfileMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (value: string) => void;
};

type PromptCapsuleOptionGroup = {
  id: "current" | "sourceLexicon" | "lexicon" | "otherLexicon" | "ai" | "common" | "recent";
  label: string;
  options: string[];
};

type ModelSwitchMenuProps = {
  activeModel: string | null;
  canSort: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  options: string[];
  search: string;
  onClear: () => void;
  onClose: () => void;
  onDelete: (value: string) => void;
  onReorder: (sourceValue: string, targetValue: string) => void;
  onSearchChange: (value: string) => void;
  onSelect: (value: string) => void;
};

function ModelSwitchMenu({
  activeModel,
  canSort,
  menuRef,
  options,
  search,
  onClear,
  onClose,
  onDelete,
  onReorder,
  onSearchChange,
  onSelect,
}: ModelSwitchMenuProps) {
  const customModel = search.trim();
  const canUseCustomModel =
    customModel.length > 0 && !options.some((option) => isSameGenerationModelLabel(option, customModel));
  const [draggedModel, setDraggedModel] = useState<string | null>(null);
  const [dragOverModel, setDragOverModel] = useState<string | null>(null);
  const [deleteReadyModel, setDeleteReadyModel] = useState<string | null>(null);
  const deleteRevealTimerRef = useRef<number | null>(null);

  function clearDeleteRevealTimer() {
    if (deleteRevealTimerRef.current === null) {
      return;
    }

    window.clearTimeout(deleteRevealTimerRef.current);
    deleteRevealTimerRef.current = null;
  }

  function scheduleDeleteReveal(option: string) {
    clearDeleteRevealTimer();
    deleteRevealTimerRef.current = window.setTimeout(() => {
      setDeleteReadyModel(option);
      deleteRevealTimerRef.current = null;
    }, 500);
  }

  function hideDeleteControl(option: string) {
    clearDeleteRevealTimer();
    setDeleteReadyModel((current) => (current && isSameGenerationModelLabel(current, option) ? null : current));
  }

  function deleteOption(option: string) {
    clearDeleteRevealTimer();
    setDeleteReadyModel(null);
    onDelete(option);
  }

  useEffect(() => {
    return () => clearDeleteRevealTimer();
  }, []);

  return (
    <div
      className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-panel shadow-elevated"
      ref={menuRef}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">切换模型</span>
        <button
          aria-label="关闭模型选择"
          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground"
          type="button"
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>

      <label className="mx-2 mt-2 flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-2 text-muted focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Search size={14} />
        <input
          aria-label="搜索模型"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          placeholder="搜索或输入模型"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && customModel) {
              event.preventDefault();
              onSelect(customModel);
            }
          }}
        />
      </label>

      <div className="mt-2 max-h-72 overflow-y-auto p-1.5" role="listbox">
        {activeModel ? (
          <button
            className="mb-1 flex min-h-9 w-full items-center justify-between gap-3 rounded-xl bg-primary-soft px-2.5 text-left text-sm text-foreground"
            type="button"
            onClick={() => onSelect(activeModel)}
          >
            <span className="min-w-0 truncate">当前：{activeModel}</span>
            <Check size={14} />
          </button>
        ) : null}

        {canUseCustomModel ? (
          <button
            className="mb-1 flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 text-left text-sm text-foreground transition-colors hover:bg-primary-soft"
            type="button"
            onClick={() => onSelect(customModel)}
          >
            <Plus size={14} />
            <span className="min-w-0 truncate">使用“{customModel}”</span>
          </button>
        ) : null}

        {options.length > 0 ? (
          options.map((option) => {
            const selected = activeModel ? isSameGenerationModelLabel(option, activeModel) : false;
            const isDragging = draggedModel ? isSameGenerationModelLabel(draggedModel, option) : false;
            const isDragOver = dragOverModel ? isSameGenerationModelLabel(dragOverModel, option) : false;
            const isDeleteReady = deleteReadyModel ? isSameGenerationModelLabel(deleteReadyModel, option) : false;

            return (
              <div
                aria-selected={selected}
                className={`group/model-row grid min-h-9 w-full grid-cols-[24px_minmax(0,1fr)_32px] items-center gap-1 rounded-md text-sm transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : isDragOver
                      ? "bg-primary-soft text-foreground ring-1 ring-primary/30"
                      : "text-foreground hover:bg-primary-soft"
                } ${isDragging ? "opacity-55" : ""}`}
                draggable={canSort}
                key={option}
                role="option"
                title={option}
                onDragEnd={() => {
                  setDraggedModel(null);
                  setDragOverModel(null);
                }}
                onDragEnter={(event) => {
                  if (!canSort || !draggedModel) {
                    return;
                  }

                  event.preventDefault();
                  setDragOverModel(option);
                }}
                onDragOver={(event) => {
                  if (!canSort || !draggedModel) {
                    return;
                  }

                  event.preventDefault();
                }}
                onDragStart={(event) => {
                  if (!canSort) {
                    event.preventDefault();
                    return;
                  }

                  setDraggedModel(option);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", option);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceModel = draggedModel ?? event.dataTransfer.getData("text/plain");

                  setDraggedModel(null);
                  setDragOverModel(null);

                  if (!sourceModel || isSameGenerationModelLabel(sourceModel, option)) {
                    return;
                  }

                  onReorder(sourceModel, option);
                }}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-6 items-center justify-center text-muted/55 ${canSort ? "cursor-grab active:cursor-grabbing" : "opacity-30"}`}
                >
                  <GripVertical size={14} />
                </span>
                <button
                  className="flex min-h-9 min-w-0 items-center justify-between gap-3 rounded-md px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  type="button"
                  onClick={() => onSelect(option)}
                >
                  <span className="min-w-0 truncate">{option}</span>
                  {selected ? <Check className="shrink-0" size={14} /> : null}
                </button>
                <span
                  className="flex h-9 items-center justify-center"
                  onFocus={() => setDeleteReadyModel(option)}
                  onMouseEnter={() => scheduleDeleteReveal(option)}
                  onMouseLeave={() => hideDeleteControl(option)}
                >
                  <button
                    aria-label={`删除模型：${option}`}
                    className={`flex size-7 items-center justify-center rounded-full text-muted transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/25 ${
                      isDeleteReady ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    tabIndex={isDeleteReady ? 0 : -1}
                    type="button"
                    onBlur={() => hideDeleteControl(option)}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteOption(option);
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p className="rounded-md border border-border bg-background px-3 py-6 text-center text-xs text-muted">
            没有匹配的内置模型
          </p>
        )}
      </div>

      <div className="border-t border-border bg-background p-2">
        <button
          className="inline-flex min-h-8 w-full items-center justify-center rounded-md border border-border bg-panel px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
          type="button"
          onClick={onClear}
        >
          恢复自动识别
        </button>
      </div>
    </div>
  );
}

function PromptCapsuleMenu({
  activeValue,
  isGenerating,
  label,
  menuRef,
  optionGroups,
  position,
  variable,
  onAddCustom,
  onClose,
  onGenerateAiOptions,
  onOpenAiProfileMenu,
  onSelect,
}: PromptCapsuleMenuProps) {
  const [customValue, setCustomValue] = useState("");
  const visibleGroups = optionGroups.filter((group) => group.options.length > 0);

  function commitCustomValue() {
    const nextValue = customValue.trim();

    if (!nextValue) {
      return;
    }

    onAddCustom(nextValue);
    setCustomValue("");
  }

  return (
    <div
      className="fixed z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-panel shadow-image"
      ref={menuRef}
      style={{ left: position.left, top: position.top }}
    >
      <div className="flex items-start justify-between gap-3 bg-panel px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-6 text-foreground">{label}</h3>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted">
              {variable}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">当前：{activeValue}</p>
        </div>
        <button
          aria-label="关闭词条选择"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="bg-panel px-4 pb-3">
        <button
          data-ai-profile-trigger="true"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-transparent bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-strong))] px-4 text-sm font-semibold text-primary-foreground shadow-elevated outline-none transition-all hover:-translate-y-0.5 hover:shadow-image focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          disabled={isGenerating}
          type="button"
          onContextMenu={onOpenAiProfileMenu}
          onClick={onGenerateAiOptions}
        >
          <Sparkles size={16} />
          {isGenerating ? "生成中" : "AI词条"}
        </button>
      </div>

      <div className="max-h-[19rem] overflow-y-auto border-y border-border bg-background px-3 py-3">
        {visibleGroups.length > 0 ? (
          <div className="grid gap-2.5">
            {visibleGroups.map((group) => (
              <div className="grid gap-1.5" key={group.id}>
                <div className="flex items-center justify-between px-1 text-[11px] font-semibold leading-4 text-muted">
                  <span>{group.label}</span>
                  <span>{group.options.length}</span>
                </div>
                <div className="grid gap-1.5 rounded-xl border border-border bg-panel p-1.5">
                  {group.options.map((option) => {
                    const selected = isSameLabel(option, activeValue);

                    return (
                      <PromptCapsuleOptionButton
                        groupId={group.id}
                        key={`${group.id}-${option}`}
                        option={option}
                        selected={selected}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-panel px-4 py-7 text-center text-xs text-muted">
            还没有可切换词条
          </p>
        )}
      </div>

      <div className="grid gap-2.5 bg-panel px-4 py-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
          <input
            aria-label="自定义词条"
            className="h-10 min-w-0 rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="添加自定义选项"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCustomValue();
              }
            }}
          />
          <button
            aria-label="保存自定义词条"
            className="flex h-10 items-center justify-center rounded-xl border border-border bg-background text-muted outline-none transition-all hover:-translate-y-0.5 hover:bg-primary-soft hover:text-foreground hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/25"
            type="button"
            onClick={commitCustomValue}
          >
            <Plus size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptCapsuleOptionButton({
  groupId,
  option,
  selected,
  onSelect,
}: {
  groupId: PromptCapsuleOptionGroup["id"];
  option: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  const toneClassName = getPromptCapsuleOptionToneClassName(groupId, selected);

  return (
    <button
      className={`relative flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border py-2 pl-4 pr-3 text-left text-sm leading-5 shadow-none outline-none transition-all hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/25 ${toneClassName}`}
      title={option}
      type="button"
      onClick={() => onSelect(option)}
    >
      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-current opacity-70" aria-hidden="true" />
      <span className="min-w-0 truncate">{option}</span>
      {selected ? <Check className="shrink-0 text-primary" size={15} /> : null}
    </button>
  );
}

type CompactChipProps = {
  active?: boolean;
  editingValue: string;
  isEditing: boolean;
  label: string;
  removeLabel: string;
  onCancelEdit: () => void;
  onCommitEdit: (value: string) => void;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onRemove: () => void;
};

function CompactChip({
  active = false,
  editingValue,
  isEditing,
  label,
  removeLabel,
  onCancelEdit,
  onCommitEdit,
  onEditValueChange,
  onRemove,
  onStartEdit,
}: CompactChipProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <span className="inline-flex min-h-6 max-w-44 items-center rounded-full border border-primary bg-panel px-2 text-[11px] leading-5 text-foreground shadow-elevated">
        <input
          aria-label={`编辑 ${label}`}
          className="min-w-0 flex-1 bg-transparent outline-none"
          ref={inputRef}
          value={editingValue}
          onBlur={() => onCommitEdit(editingValue)}
          onChange={(event) => onEditValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCancelEdit();
            }
          }}
        />
      </span>
    );
  }

  return (
    <span className="group inline-flex min-h-6 max-w-full items-center gap-0.5 transition-transform duration-150 hover:scale-[1.03] focus-within:scale-[1.03]">
      <span
        className={`inline-flex min-w-0 max-w-40 cursor-text items-center rounded-full border px-2 text-[11px] leading-5 ${
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-muted group-hover:bg-primary-soft group-hover:text-foreground"
        }`}
        title={label}
        onDoubleClick={onStartEdit}
      >
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <button
        aria-label={removeLabel}
        className={`flex size-4 shrink-0 items-center justify-center rounded-full border opacity-0 outline-none transition-colors group-hover:opacity-100 focus-visible:opacity-100 ${
          active
            ? "border-primary bg-panel text-primary hover:bg-primary-soft"
            : "border-border bg-panel text-muted/70 hover:bg-primary-soft hover:text-foreground"
        }`}
        type="button"
        onClick={onRemove}
      >
        <X size={10} />
      </button>
    </span>
  );
}

type AuthorChipProps = {
  author: string;
  authorAvatarUrl: string | null;
  authorUrl: string | null;
  sourceUrl: string | null;
  onEdit: () => void;
  onHide: () => void;
};

function AuthorChip({ author, authorAvatarUrl, authorUrl, sourceUrl, onEdit, onHide }: AuthorChipProps) {
  const link = authorUrl ?? sourceUrl;
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
        <AuthorAvatar
          author={author}
          authorAvatarUrl={authorAvatarUrl}
          authorUrl={authorUrl}
          sourceUrl={sourceUrl}
        />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-semibold text-foreground">{author}</span>
        {link ? <span className="truncate text-[10px] text-muted">{formatCompactUrl(link)}</span> : null}
      </span>
    </>
  );

  return (
    <div className="inline-flex max-w-[260px] min-w-0 items-center gap-2 rounded-full border border-border bg-panel/85 py-1 pl-1 pr-2 shadow-elevated">
      {link ? (
        <a className="inline-flex min-w-0 items-center gap-2" href={link} rel="noreferrer" target="_blank" title={link}>
          {content}
        </a>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2">{content}</span>
      )}
      <button
        aria-label="编辑作者信息"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted/60 transition-colors hover:bg-background hover:text-foreground"
        type="button"
        onClick={onEdit}
      >
        <Pencil size={11} />
      </button>
      <button
        aria-label="本次隐藏作者"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted/60 transition-colors hover:bg-background hover:text-foreground"
        type="button"
        onClick={onHide}
      >
        <X size={11} />
      </button>
    </div>
  );
}

type AuthorEditFormProps = {
  authorNameDraft: string;
  authorUrlDraft: string;
  onCancel: () => void;
  onChangeName: (value: string) => void;
  onChangeUrl: (value: string) => void;
  onSubmit: () => void;
};

function AuthorEditForm({
  authorNameDraft,
  authorUrlDraft,
  onCancel,
  onChangeName,
  onChangeUrl,
  onSubmit,
}: AuthorEditFormProps) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="inline-flex max-w-[300px] min-w-0 items-center gap-1.5 rounded-full border border-border bg-panel/95 py-1 pl-2.5 pr-1 shadow-elevated">
      <input
        aria-label="作者名称"
        autoFocus
        className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-foreground outline-none placeholder:text-muted/60"
        placeholder="作者名称"
        value={authorNameDraft}
        onChange={(event) => onChangeName(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <input
        aria-label="作者链接"
        className="min-w-0 flex-1 bg-transparent text-[10px] text-muted outline-none placeholder:text-muted/60"
        placeholder="作者链接（可选）"
        value={authorUrlDraft}
        onChange={(event) => onChangeUrl(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        aria-label="保存作者信息"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted/60 transition-colors hover:bg-background hover:text-foreground"
        type="button"
        onClick={onSubmit}
      >
        <Check size={11} />
      </button>
      <button
        aria-label="取消编辑作者"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted/60 transition-colors hover:bg-background hover:text-foreground"
        type="button"
        onClick={onCancel}
      >
        <X size={11} />
      </button>
    </div>
  );
}

function AuthorAvatar({
  author,
  authorAvatarUrl,
  authorUrl,
  sourceUrl,
}: Pick<AuthorChipProps, "author" | "authorAvatarUrl" | "authorUrl" | "sourceUrl">) {
  const avatarSources = useMemo(
    () => buildAuthorAvatarSources({ authorAvatarUrl, authorUrl, sourceUrl }),
    [authorAvatarUrl, authorUrl, sourceUrl],
  );
  const avatarSourceKey = avatarSources.join("\n");
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSource = avatarSources[sourceIndex] ?? null;

  useEffect(() => {
    setSourceIndex(0);
  }, [avatarSourceKey]);

  if (currentSource) {
    return (
      <img
        alt={`${author} 的头像`}
        className="h-full w-full object-cover"
        src={currentSource}
        onError={() => setSourceIndex((currentIndex) => currentIndex + 1)}
      />
    );
  }

  return <AppLogoMark className="size-full rounded-full" iconSize={14} />;
}

type ImageNavButtonProps = {
  ariaLabel: string;
  direction: "left" | "right";
  onClick: () => void;
};

function ImageNavButton({ ariaLabel, direction, onClick }: ImageNavButtonProps) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <div
      className={`group/nav absolute top-0 z-20 flex h-full w-24 items-center ${
        direction === "left" ? "left-0 justify-start pl-3 min-[980px]:pl-5" : "right-0 justify-end pr-3 min-[980px]:pr-5"
      }`}
    >
      <button
        aria-label={ariaLabel}
        className="pointer-events-none flex size-11 translate-y-1 items-center justify-center rounded-full border border-border bg-panel/95 text-foreground opacity-0 shadow-elevated outline-none transition-all duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/30 group-hover/nav:pointer-events-auto group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:pointer-events-auto group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100"
        type="button"
        onClick={onClick}
      >
        <Icon size={20} />
      </button>
    </div>
  );
}

function buildPromptTextFromParts(promptValue: string, negativePromptValue: string): string {
  const prompt = resolvePromptTemplateText(normalizePromptText(promptValue));
  const negativePrompt = resolvePromptTemplateText(normalizePromptText(negativePromptValue));
  const parts = [prompt, negativePrompt ? `负向提示词：${negativePrompt}` : ""].filter(Boolean);

  return parts.join("\n\n") || "暂无提示词详情。";
}

function logPromptDetailEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
  }
}

function promptHasTemplateParameters(text: string): boolean {
  return parsePromptTemplateSegments(text).some((segment) => segment.type === "parameter");
}

function buildSavedCapsuleAnalysis(
  item: PromptCardData,
  prompt: string,
  negativePrompt: string,
  knownCategories: readonly string[],
): PromptAnalysisResult | null {
  const promptAnalysis = buildPromptAnalysisFromSavedCapsules(`${prompt}\n${negativePrompt}`, {
    title: item.title,
    tags: item.tags,
    currentCategory: item.category,
    knownCategories,
  });

  return promptAnalysis ? omitNegativeAnalysisSections(promptAnalysis) : null;
}

function replacePromptTemplateParameterValue(
  text: string,
  targetParameterIndex: number,
  fallbackVariable: string,
  nextValue: string,
): string {
  let parameterIndex = -1;

  return parsePromptTemplateSegments(text)
    .map((segment) => {
      if (segment.type !== "parameter") {
        return segment.text;
      }

      parameterIndex += 1;

      if (parameterIndex !== targetParameterIndex) {
        return segment.source;
      }

      const variable = fallbackVariable.trim() || segment.variable.trim();

      return `{{${variable}: ${nextValue}}}`;
    })
    .join("");
}

function collectPromptCapsuleOptionGroups({
  capsule,
  analysis,
  generatedValues,
  currentPromptLexiconValues,
  globalLexiconValues,
  otherPromptLexiconValues,
  prompt,
}: {
  capsule: ActivePromptCapsule;
  analysis: PromptAnalysisResult | null;
  generatedValues: string[];
  currentPromptLexiconValues: string[];
  globalLexiconValues: string[];
  otherPromptLexiconValues: string[];
  prompt: string;
}): PromptCapsuleOptionGroup[] {
  const usedValues: string[] = [];
  const takeValues = (values: readonly string[], limit: number) => {
    const filteredValues = filterPromptOptionValues({
      variable: capsule.variable,
      values,
      currentValue: capsule.value,
    });
    const takenValues: string[] = [];

    for (const value of filteredValues) {
      if (usedValues.some((usedValue) => isSameLabel(usedValue, value))) {
        continue;
      }

      usedValues.push(value);
      takenValues.push(value);

      if (takenValues.length >= limit) {
        break;
      }
    }

    return takenValues;
  };
  const localOptions = buildPromptOptionAnalysis({
    prompt,
    optionLabel: capsule.label,
    optionValue: capsule.value,
    optionVariable: capsule.variable,
  }).sections.flatMap((section) => (isSameVariable(section.variable, capsule.variable) ? section.values : []));
  const analysisOptions = analysis
    ? analysis.sections.flatMap((section) => (isSameVariable(section.variable, capsule.variable) ? section.values : []))
    : [];

  return [
    { id: "current", label: "当前使用", options: takeValues([capsule.value], 1) },
    { id: "ai", label: "AI 扩写", options: takeValues(generatedValues, 5) },
    { id: "sourceLexicon", label: "当前提示词词库", options: takeValues(currentPromptLexiconValues, 10) },
    { id: "lexicon", label: "通用参数词库", options: takeValues(globalLexiconValues, 8) },
    { id: "otherLexicon", label: "其它提示词同类参数", options: takeValues(otherPromptLexiconValues, 12) },
    { id: "common", label: "常用词条", options: takeValues(localOptions, 8) },
    { id: "recent", label: "最近使用", options: takeValues(analysisOptions, 6) },
  ];
}

function getPromptCapsuleLabel(variable: string, analysis: PromptAnalysisResult | null): string {
  const analysisLabel = analysis?.sections.find((section) => isSameVariable(section.variable, variable))?.label;

  return analysisLabel ?? getFallbackCapsuleLabel(variable);
}

function getFallbackCapsuleLabel(variable: string): string {
  const normalizedVariable = normalizeVariableKey(variable);
  const sectionMeta = Object.values(promptSectionMeta).find(
    (meta) => normalizeVariableKey(meta.variable) === normalizedVariable || normalizeVariableKey(meta.key) === normalizedVariable,
  );

  if (sectionMeta) {
    return sectionMeta.label;
  }

  const labels: Record<string, string> = {
    avoid: "避免内容",
    aspectratio: "画面比例",
    atmosphere: "氛围",
    brand: "知名品牌",
    cameraangle: "拍摄角度",
    clothing: "服装细节",
    color: "颜色",
    colordetail: "色彩细节",
    composition: "构图逻辑",
    depthoffield: "景深区分",
    details: "补充信息",
    facemakeup: "面部妆容",
    famousperson: "著名人物",
    hairaccessory: "发型头饰",
    handgesture: "手部手势",
    handprop: "手上道具",
    imagestyle: "图像风格",
    lightreceiving: "受光情况",
    lightshadow: "光影",
    pose: "动作姿态",
    shotsize: "景别",
    textcontent: "文本内容",
    typography: "字体",
  };

  return labels[normalizedVariable] ?? "提示词参数";
}

function getPromptCapsuleToneClassName(variable: string): string {
  const toneByVariable: Record<string, string> = {
    aspectratio: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
    atmosphere: "border-capsule-sand-border bg-capsule-sand text-capsule-sand-foreground",
    avoid: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    brand: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    cameraangle: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
    clothing: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
    color: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
    colordetail: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
    composition: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    depthoffield: "border-capsule-fog-border bg-capsule-fog text-capsule-fog-foreground",
    details: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    facemakeup: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
    famousperson: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
    hairaccessory: "border-capsule-sand-border bg-capsule-sand text-capsule-sand-foreground",
    handgesture: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
    handprop: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
    imagestyle: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
    lightreceiving: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    lightshadow: "border-capsule-fog-border bg-capsule-fog text-capsule-fog-foreground",
    pose: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
    shotsize: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
    textcontent: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
    typography: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
  };

  return toneByVariable[normalizeVariableKey(variable)] ?? toneByVariable.details;
}

function getPromptCapsuleOptionToneClassName(groupId: PromptCapsuleOptionGroup["id"], selected: boolean): string {
  const baseToneByGroup: Record<PromptCapsuleOptionGroup["id"], string> = {
    current:
      "border-primary/20 bg-primary-soft text-foreground [&>span:first-child]:bg-primary",
    sourceLexicon:
      "border-capsule-mist-border bg-capsule-mist/85 text-capsule-mist-foreground [&>span:first-child]:bg-capsule-mist-foreground",
    lexicon:
      "border-capsule-stone-border bg-capsule-stone/75 text-capsule-stone-foreground [&>span:first-child]:bg-capsule-stone-foreground",
    otherLexicon:
      "border-capsule-fog-border bg-capsule-fog/75 text-capsule-fog-foreground [&>span:first-child]:bg-capsule-fog-foreground",
    ai:
      "border-capsule-lavender-border bg-capsule-lavender/80 text-capsule-lavender-foreground [&>span:first-child]:bg-capsule-lavender-foreground",
    common:
      "border-capsule-sage-border bg-capsule-sage/70 text-capsule-sage-foreground [&>span:first-child]:bg-capsule-sage-foreground",
    recent:
      "border-capsule-sand-border bg-capsule-sand/75 text-capsule-sand-foreground [&>span:first-child]:bg-capsule-sand-foreground",
  };
  const selectedToneByGroup: Record<PromptCapsuleOptionGroup["id"], string> = {
    current:
      "border-primary/25 bg-[linear-gradient(90deg,var(--color-primary-soft),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-primary",
    sourceLexicon:
      "border-capsule-mist-border bg-[linear-gradient(90deg,var(--color-capsule-mist),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-mist-foreground",
    lexicon:
      "border-capsule-stone-border bg-[linear-gradient(90deg,var(--color-capsule-stone),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-stone-foreground",
    otherLexicon:
      "border-capsule-fog-border bg-[linear-gradient(90deg,var(--color-capsule-fog),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-fog-foreground",
    ai:
      "border-capsule-lavender-border bg-[linear-gradient(90deg,var(--color-capsule-lavender),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-lavender-foreground",
    common:
      "border-capsule-sage-border bg-[linear-gradient(90deg,var(--color-capsule-sage),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-sage-foreground",
    recent:
      "border-capsule-sand-border bg-[linear-gradient(90deg,var(--color-capsule-sand),var(--color-panel))] text-foreground shadow-elevated [&>span:first-child]:bg-capsule-sand-foreground",
  };

  return selected ? selectedToneByGroup[groupId] : baseToneByGroup[groupId];
}

function addUniqueValues(currentValues: readonly string[], nextValues: readonly string[]): string[] {
  const values: string[] = [];

  for (const value of [...currentValues, ...nextValues]) {
    const normalized = value.trim();

    if (!normalized || values.some((item) => isSameLabel(item, normalized))) {
      continue;
    }

    values.push(normalized);
  }

  return values;
}

function isSameVariable(first: string, second: string): boolean {
  return normalizeVariableKey(first) === normalizeVariableKey(second);
}

function normalizeVariableKey(value: string): string {
  return value.trim().toLowerCase();
}

function areStringArraysEqual(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function getCategoryChips(
  savedCategory: string,
  tags: readonly string[],
  knownCategories: readonly string[],
): string[] {
  const primaryCategories = savedCategory && savedCategory !== "未分类" ? [savedCategory] : [];
  const tagCategories = tags
    .map((tag) => resolveKnownCategoryTag(tag, knownCategories))
    .filter((tag): tag is string => tag !== null);

  return uniquePromptLabels([...primaryCategories, ...tagCategories]).slice(0, maxAiCategoryCount);
}

function getVisibleTagDrafts(tags: readonly string[], categoryChips: readonly string[]): string[] {
  return tags.filter(
    (tag) => !isGenericPromptLabel(tag) && !categoryChips.some((category) => isSameLabel(category, tag)),
  );
}

function buildStoredTagsFromVisibleTags(
  visibleTags: readonly string[],
  categoryChips: readonly string[],
): string[] {
  return uniquePromptLabels([...visibleTags, ...categoryChips.slice(1)]);
}

function uniquePromptLabels(values: readonly string[]): string[] {
  const labels: string[] = [];

  for (const value of values) {
    const label = value.trim();

    if (!label || labels.some((item) => isSameLabel(item, label))) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}

function resolveKnownCategoryTag(value: string, knownCategories: readonly string[]): string | null {
  const directCategory = knownCategories.find((category) => isSameLabel(category, value));

  if (directCategory) {
    return directCategory;
  }

  const normalizedCategory = normalizePhotographyCategorySuggestions([value])[0];

  if (!normalizedCategory) {
    return null;
  }

  return knownCategories.find((category) => isSameLabel(category, normalizedCategory)) ?? null;
}

function resolveCategoryChoice(value: string, knownCategories: readonly string[]): string {
  const normalized = value.trim();

  if (!normalized || isGenericPromptLabel(normalized)) {
    return "未分类";
  }

  return knownCategories.find((category) => isSameLabel(category, normalized)) ?? normalized;
}

function normalizeCategorySuggestions(values: readonly string[], knownCategories: readonly string[]): string[] {
  const suggestions: string[] = [];

  for (const value of values) {
    const category = resolveCategoryChoice(value, knownCategories);

    if (category === "未分类" || suggestions.some((item) => isSameLabel(item, category))) {
      continue;
    }

    suggestions.push(category);
  }

  return suggestions;
}

function isSameLabel(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function getVisibleModelOptions(
  search: string,
  activeModel: string | null,
  preferences: GenerationModelPreferences,
): string[] {
  const query = normalizeModelSearch(search);
  const builtInOptions = getGenerationModelOptions(preferences);
  const options = builtInOptions.filter((option) => {
    if (activeModel && isSameGenerationModelLabel(option, activeModel)) {
      return false;
    }

    return !query || normalizeModelSearch(option).includes(query);
  });

  return options.slice(0, 80);
}

function getAiProfileActionLabel(action: AiProfileAction): string {
  const labels: Record<AiProfileAction, string> = {
    prompt: "提示词参数分析",
    "prompt-category": "提示词分类识别",
    "prompt-tags": "提示词标签识别",
    "prompt-options": "AI 词条扩写",
    "prompt-optimization": "提示词优化",
    "prompt-translation": "提示词翻译",
    "image-reverse": "图像反推",
    "image-category": "分类识别",
    "image-tags": "标签识别",
  };

  return labels[action];
}

function getAiProfileActionCapability(action: AiProfileAction): "text" | "vision" {
  return aiFeatureActionMeta[action].capability;
}

function getRecognitionAction(kind: AiRecognitionKind, source: AiRecognitionSource): Extract<AiAnalyzeTarget, AiProfileAction> {
  if (kind === "category") {
    return source === "image" ? "image-category" : "prompt-category";
  }

  return source === "image" ? "image-tags" : "prompt-tags";
}

function getAiRecognitionSourceLabel(source: AiRecognitionSource): string {
  return source === "image" ? "从效果图分析" : "从提示词分析";
}

function getPromptLanguageLabel(language: PromptLanguageVersion): string {
  return language === "zh" ? "中文" : "英文";
}

function detectPromptLanguage(prompt: string, negativePrompt = ""): PromptLanguageVersion {
  const text = `${prompt}\n${negativePrompt}`;
  const cjkCount = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;

  return cjkCount >= 4 ? "zh" : "en";
}

function toAiPayloadSelection(selection: AiModelSelection | undefined): {
  apiProfileId?: string;
  apiModelId?: string;
} {
  return selection
    ? {
        apiProfileId: selection.profileId,
        apiModelId: selection.modelId,
      }
    : {};
}

function hasAiModelSelection(settings: PublicAiProviderSettings, selection: AiModelSelection): boolean {
  const profile = settings.profiles.find((item) => item.id === selection.profileId);

  return Boolean(profile?.enabled && profile.models.some((model) => model.id === selection.modelId));
}

function getSelectableAiProfiles(settings: PublicAiProviderSettings): PublicAiProviderProfile[] {
  return settings.profiles.filter((profile) => profile.enabled);
}

function isPublicAiProfileReady(profile: PublicAiProviderProfile): boolean {
  return Boolean(
    profile.enabled &&
      profile.baseUrl &&
      profile.hasApiKey &&
      profile.models.some((model) => model.id === profile.model),
  );
}

function AiModelCapabilityIcons({ capabilities }: { capabilities: readonly AiProviderModelCapability[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted">
      {capabilities.includes("text") ? <FileText size={13} /> : null}
      {capabilities.includes("vision") ? <ImageIcon size={13} /> : null}
    </span>
  );
}

function normalizeModelSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function formatCompactUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, "");
    const compactPath = path && path !== "/" ? path.split("/").slice(0, 2).join("/") : "";

    return `${url.hostname.replace(/^www\./, "")}${compactPath}`;
  } catch {
    return value;
  }
}

function buildShareText({
  title,
  author,
  tags,
  promptText,
}: {
  title: string;
  author: string | null;
  tags: string[];
  promptText: string;
}): string {
  const parts = [
    title.trim() ? `标题：${title.trim()}` : "",
    author ? `作者：${author}` : "",
    tags.length > 0 ? `标签：${tags.join("，")}` : "",
    `提示词：\n${promptText}`,
  ].filter(Boolean);

  return parts.join("\n\n");
}

type ReferenceImageThumbProps = {
  imageFileName: string;
  index: number;
  size: "sm" | "md";
  isDeleting: boolean;
  onPreview: (imageFileName: string) => void;
  onDelete: (imageFileName: string) => void;
};

function ReferenceImageThumb({
  imageFileName,
  index,
  size,
  isDeleting,
  onPreview,
  onDelete,
}: ReferenceImageThumbProps) {
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);
  const [isPointerOverDelete, setIsPointerOverDelete] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  const sizeClassName = size === "sm" ? "size-14" : "size-16";
  const isAudio = isAudioMediaFile(imageFileName);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }

    didLongPressRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      setIsDeleteArmed(true);
    }, 450);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!isDeleteArmed || !deleteButtonRef.current) {
      return;
    }

    const rect = deleteButtonRef.current.getBoundingClientRect();
    const isOver =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    setIsPointerOverDelete(isOver);
  }

  function handlePointerUp() {
    clearLongPressTimer();

    if (isDeleteArmed && isPointerOverDelete) {
      onDelete(imageFileName);
    }

    setIsDeleteArmed(false);
    setIsPointerOverDelete(false);
  }

  function handleClick() {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onPreview(imageFileName);
  }

  return (
    <div
      className="pointer-events-auto group/ref relative"
      onPointerLeave={() => {
        clearLongPressTimer();
        setIsDeleteArmed(false);
        setIsPointerOverDelete(false);
      }}
    >
      <button
        ref={deleteButtonRef}
        aria-label={`删除参考图 ${index + 1}`}
        className={`absolute -right-1.5 -top-1.5 z-10 flex size-4 items-center justify-center rounded-full border border-border bg-panel text-muted/70 shadow-sm outline-none transition-all duration-150 hover:bg-danger-soft hover:text-danger ${
          isDeleteArmed
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0 group-hover/ref:pointer-events-auto group-hover/ref:scale-100 group-hover/ref:opacity-100"
        } ${isPointerOverDelete ? "scale-110 border-danger bg-danger text-white" : ""}`}
        disabled={isDeleting}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(imageFileName);
        }}
      >
        <X size={10} />
      </button>
      <button
        className={`relative ${sizeClassName} overflow-hidden rounded-lg border bg-background shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/35 ${
          isDeleteArmed ? "border-danger ring-2 ring-danger/40" : "border-border"
        } ${isDeleting ? "pointer-events-none opacity-50" : ""}`}
        title={`${isAudio ? "音频" : "参考图"} ${index + 1}（点击试听，长按删除）`}
        type="button"
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {isAudio ? (
          <span className="flex size-full items-center justify-center bg-primary-soft text-primary">
            <Music2 size={20} />
          </span>
        ) : (
          <img
            alt={`参考图 ${index + 1}`}
            className="block size-full object-cover"
            decoding="async"
            draggable={false}
            loading="lazy"
            src={getImageThumbnailSrc(imageFileName)}
          />
        )}
      </button>
    </div>
  );
}

type ReferenceImageFloatingStripProps = {
  referenceImages: string[];
  deletingImageFileName: string | null;
  onPreview: (imageFileName: string) => void;
  onDelete: (imageFileName: string) => void;
};

function ReferenceImageFloatingStrip({
  referenceImages,
  deletingImageFileName,
  onPreview,
  onDelete,
}: ReferenceImageFloatingStripProps) {
  if (referenceImages.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[62%] flex-col items-start gap-1">
      <span className="rounded-full bg-panel/90 px-2 py-0.5 text-[10px] font-semibold text-muted shadow-sm backdrop-blur">
        参考图 {referenceImages.length}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {referenceImages.map((imageFileName, index) => (
          <ReferenceImageThumb
            key={`${imageFileName}-${index}`}
            imageFileName={imageFileName}
            index={index}
            isDeleting={deletingImageFileName === imageFileName}
            size="sm"
            onDelete={onDelete}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  );
}

type ReferenceImagePreviewOverlayProps = {
  imageFileName: string;
  onClose: () => void;
};

function ReferenceImagePreviewOverlay({ imageFileName, onClose }: ReferenceImagePreviewOverlayProps) {
  const isVideo = isVideoMediaFile(imageFileName);
  const isAudio = isAudioMediaFile(imageFileName);

  function handlePreviewVideoRef(element: HTMLVideoElement | null) {
    if (!element) {
      return;
    }

    element.volume = getStoredVideoVolume();
    element.muted = getStoredVideoMuted();
  }

  function handlePreviewAudioRef(element: HTMLAudioElement | null) {
    if (!element) {
      return;
    }

    element.volume = getStoredAudioVolume();
    element.muted = getStoredAudioMuted();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        aria-label="关闭预览"
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-panel/90 text-foreground shadow-elevated outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/40"
        type="button"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      {isVideo ? (
        <video
          aria-label="参考素材预览"
          className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-image"
          controls
          playsInline
          ref={handlePreviewVideoRef}
          src={getImageSrc(imageFileName)}
          onClick={(event) => event.stopPropagation()}
          onVolumeChange={(event) => {
            storeVideoVolume(event.currentTarget.volume);
            storeVideoMuted(event.currentTarget.muted);
          }}
        />
      ) : isAudio ? (
        <audio
          aria-label="音频参考素材试听"
          className="w-[min(88vw,640px)] rounded-lg bg-panel p-4 shadow-image"
          controls
          ref={handlePreviewAudioRef}
          src={getImageSrc(imageFileName)}
          onClick={(event) => event.stopPropagation()}
          onVolumeChange={(event) => {
            storeAudioVolume(event.currentTarget.volume);
            storeAudioMuted(event.currentTarget.muted);
          }}
        />
      ) : (
        <img
          alt="参考素材预览"
          className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-image"
          decoding="async"
          src={getImageSrc(imageFileName)}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>,
    document.body,
  );
}

type ReferenceImagePopoverProps = {
  innerRef: RefObject<HTMLDivElement | null>;
  isImporting: boolean;
  referenceImages: string[];
  deletingImageFileName: string | null;
  onClose: () => void;
  onImportFromClipboard: () => void;
  onImportFromLocal: () => void;
  onPreview: (imageFileName: string) => void;
  onDelete: (imageFileName: string) => void;
};

function ReferenceImagePopover({
  innerRef,
  isImporting,
  referenceImages,
  deletingImageFileName,
  onClose,
  onImportFromClipboard,
  onImportFromLocal,
  onPreview,
  onDelete,
}: ReferenceImagePopoverProps) {
  const hasImages = referenceImages.length > 0;

  return (
    <div
      ref={innerRef}
      className="absolute bottom-2 right-2 z-10 flex w-80 flex-col gap-3 rounded-xl border border-border bg-panel p-3 shadow-lg"
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

      {hasImages ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2 pt-1">
          {referenceImages.map((imageFileName, index) => (
            <ReferenceImageThumb
              key={`${imageFileName}-${index}`}
              imageFileName={imageFileName}
              index={index}
              isDeleting={deletingImageFileName === imageFileName}
              size="md"
              onDelete={onDelete}
              onPreview={onPreview}
            />
          ))}
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
          <Clipboard size={13} />
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
