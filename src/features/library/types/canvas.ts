import type {
  AiGeneratedImage,
  AiImageGenerationFormat,
  AiImageGenerationQuality,
} from "./ai";

export type CanvasSizeMode = "auto" | "ratio" | "custom";

/** 右侧创意画布的状态机阶段。与 CanvasView 的局部 phase 同义，提到 store
 *  后让生成态在切走画布再切回时保留（生成请求本身在主进程后台继续）。 */
export type CanvasPhase = "empty" | "thinking" | "generating" | "reveal" | "created";

export type CanvasBaseResolution = "1k" | "2k" | "3k" | "4k";
export type CanvasAspectRatio = "1:1" | "3:2" | "2:3" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
export type CanvasGenerationProvider = "api" | "doubao-web";

export type DoubaoWebCanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DoubaoWebCanvasStatus = {
  ready: boolean;
  authenticated: boolean;
  loginRequired: boolean;
};

/**
 * 从素材库某个提示词组「传送到画布」时记录的来源血缘。
 *
 * 生成图入库时，只有正/负提示词与传送那一刻完全一致，才继承来源组的身份字段
 * （标题 / 标签 / 分类），从而归入原提示词组；用户改过提示词就不继承，
 * 自然分裂成新的提示词组。
 *
 * Session-only：与 referenceImageDataUrl 一样，持久化前会被剥离
 * （见 buildLibraryViewSettings）。
 */
export type CanvasPromptOrigin = {
  /** 来源效果图的 item id，用于日志定位。 */
  itemId: string;
  /** 传送那一刻的正向提示词，作为「是否改动」的比对基准。 */
  prompt: string;
  /** 传送那一刻的负向提示词。 */
  negativePrompt: string;
  /** 来源提示词组的身份字段，命中继承时原样写入新条目。 */
  title: string;
  tags: string[];
  category: string | null;
  categoryId: string | null;
  genreIds: string[];
  /** 分类元数据也原样继承（可能是 AI 打的分类），不伪造成用户手动指定。 */
  categoryConfidence: number | null;
  categorySource: "system" | "user" | "ai" | "local" | null;
};

export type CanvasReferenceImage = {
  fileName: string;
  title: string;
  /**
   * Reference image data URL. Session-only: stripped before the draft
   * is persisted (see buildLibraryViewSettings).
   */
  dataUrl: string;
};

export type CanvasDraftSettings = {
  generationProvider: CanvasGenerationProvider;
  /** Hide the complete creation panel without changing its individual controls. */
  creationPanelCollapsed: boolean;
  prompt: string;
  positivePromptHeight: number;
  /** Multiple reference images for image-to-image generation. */
  referenceImages: CanvasReferenceImage[];
  negativePrompt: string;
  negativePromptHidden: boolean;
  positivePromptHidden: boolean;
  sizePanelHidden: boolean;
  advancedSettingsOpen: boolean;
  doubaoModelHidden: boolean;
  doubaoStyleHidden: boolean;
  sizeMode: CanvasSizeMode;
  baseResolution: CanvasBaseResolution;
  aspectRatio: CanvasAspectRatio;
  customWidth: number;
  customHeight: number;
  quality: AiImageGenerationQuality;
  outputFormat: AiImageGenerationFormat;
  count: number;
  /** Video generation controls used when the selected model is an Agnes video model. */
  videoSeconds: number;
  videoSize: "720P" | "960P" | "2K";
  transparentBackground: boolean;
  notificationEnabled: boolean;
  /**
   * 生成结果是否自动收录为素材。
   * 默认 false（不再自动收录）：生成后结果只在画布内预览，可手动导出/复制；
   * 用户在画布顶部手动开启后，生成完成才走入库链路落盘到素材库。
   * 持久化字段（与 notificationEnabled 同级，随草稿保存）。
   */
  autoArchiveEnabled: boolean;
  /** 豆包网页画布：选中的模型标签（空串=跟随网页默认，不自动切换）。 */
  doubaoModel: string;
  /** 豆包网页画布：选中的风格标签（空串=跟随网页默认，不自动切换）。 */
  doubaoStyle: string;
  /**
   * 「传送到画布」带过来的来源提示词组血缘。null = 画布里自由创作，不归入任何已有组。
   * Session-only：持久化前剥离（见 buildLibraryViewSettings）。
   */
  promptOrigin: CanvasPromptOrigin | null;
};


/** Session-only preview data. Kept in Zustand so it survives CanvasView unmounts. */
export type CanvasGenerationResult = AiGeneratedImage & {
  saved: boolean;
  /** 入库完成后用于导出和复制的正式素材文件名。 */
  imageFileName?: string;
  /**
   * 本次真正提交给模型的正向提示词（`AiGeneratedImage.revisedPrompt` 是模型自己改写的
   * 版本，很多模型根本不返回）。生成时快照到结果上，预览卡片与手动收录都读它：
   * 生成后再改草稿也不会让「生成结果」显示成另一段提示词。
   */
  requestPrompt?: string;
  /** 同上，本次提交的反向提示词快照。 */
  requestNegativePrompt?: string;
};
