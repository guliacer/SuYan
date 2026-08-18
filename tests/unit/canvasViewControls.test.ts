import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvasSource = readFileSync("src/features/library/components/CanvasView.tsx", "utf8");
const storeSource = readFileSync("src/features/library/store/useLibraryStore.ts", "utf8");
const canvasGenSource = readFileSync("src/features/library/utils/canvasGeneration.ts", "utf8");
const viewSettingsSource = readFileSync("electron/main/library/viewSettingsStore.ts", "utf8");

describe("CanvasView controls", () => {
  it.each(["\u590d\u5236", "\u7c98\u8d34", "\u4f18\u5316", "\u8fd4\u56de", "\u6e05\u7a7a"])(
    "renders the %s prompt action for both prompt fields",
    (label) => {
      if (label === "\u4f18\u5316") {
        expect(canvasSource).toContain('label={isOptimizing ? "\u4f18\u5316\u4e2d" : "\u4f18\u5316"}');
      } else {
        expect(canvasSource).toContain(`label="${label}"`);
      }
    },
  );

  it("remembers the resizable positive prompt height", () => {
    expect(canvasSource).toContain("positivePromptHeight");
    expect(canvasSource).toContain("height={canvasDraft.positivePromptHeight}");
    expect(canvasSource).toContain("onPointerUp");
    expect(canvasSource).toContain("onHeightChange");
    expect(storeSource).toContain("...get().canvasDraft");
    expect(viewSettingsSource).toContain("normalizeCanvasDraftSettings(input.canvasDraft)");
  });

  it("opens the reference-image popover and收敛 the positive prompt tools into primary actions plus a more menu", () => {
    expect(canvasSource).toContain("isReferenceImagePopoverOpen");
    expect(canvasSource).toContain("setIsReferenceImagePopoverOpen(true)");
    expect(canvasSource).toContain("添加参考图");
    expect(canvasSource).toContain("PromptMoreMenuItem");
    expect(canvasSource).toContain("CanvasReferenceImagePopover");
    expect(canvasSource).toContain("onImportFromClipboard");
  });

  it("uses the preload clipboard bridge instead of direct renderer access", () => {
    expect(canvasSource).toContain("window.suyanApi.writeClipboardText");
    expect(canvasSource).toContain("window.suyanApi.readClipboardText");
    expect(canvasSource).not.toContain("navigator.clipboard");
    // 点击粘贴时先清空再写入，不在原文本上追加。
    expect(canvasSource).toContain("updateFieldText(field, pastedText, \"action\")");
    expect(canvasSource).not.toContain("currentText.slice(0, selectionStart)");
  });

  it("supports negative prompt visibility and transparent image generation", () => {
    expect(canvasSource).toContain("negativePromptHidden");
    expect(canvasSource).toContain("iconOnlyActions");
    expect(canvasSource).toContain("aria-label={label === \"返回\" ? \"撤销最近一次更改\" : label}");
    expect(canvasSource).toContain("iconOnly ? \"sr-only\" : \"truncate\"");
    expect(canvasSource).toContain("buildCanvasImageGenerationPayload(canvasDraft");
    expect(canvasSource).toContain('disabled: canvasDraft.transparentBackground && option.value === "jpeg"');
    expect(canvasSource).toContain('value={canvasDraft.outputFormat}');
  });

  it("exposes the reference-style size modes and ratios", () => {
    expect(canvasSource).toContain('label: "\u81ea\u52a8"');
    expect(canvasSource).toContain('label: "\u6309\u6bd4\u4f8b"');
    expect(canvasSource).toContain('label: "\u81ea\u5b9a\u4e49\u5bbd\u9ad8"');
    expect(canvasSource).toContain('{ value: "1k", label: "1K" }');
    expect(canvasSource).toContain('{ value: "2k", label: "2K" }');
    expect(canvasSource).toContain('{ value: "4k", label: "4K" }');
    expect(canvasSource).toContain("onClick={() => onDraftChange({ baseResolution: option.value })}");
    expect(canvasSource).not.toContain('<ResolutionButton disabled label="2K" />');
    expect(canvasSource).toContain("getCanvasGenerationSizeLabel(resolveCanvasGenerationSize(canvasDraft))");
    expect(canvasSource).toContain("上方显示的实际请求像素");
  });

  it("persists whether advanced canvas settings are expanded", () => {
    expect(canvasSource).toContain("<CanvasAdvancedPanel");
    expect(canvasSource).toContain('aria-label={hidden ? "显示高级设置" : "隐藏高级设置"}');
    expect(canvasSource).toContain("hidden={!canvasDraft.advancedSettingsOpen}");
    expect(canvasSource).toContain("advancedSettingsOpen: !canvasDraft.advancedSettingsOpen");
    expect(canvasSource).toContain("CanvasSizePanel");
    expect(canvasSource).not.toContain("const [isAdvancedOpen, setIsAdvancedOpen] = useState");
  });

  it("uses the generation prompt as the archived image title without an AI title request", () => {
    expect(canvasSource).toContain("title: cleanPrompt");
    expect(canvasSource).not.toContain("onSummarizeTitle");
    expect(canvasSource).not.toContain("buildFallbackTitle");
  });

  it("archives generated images only when autoArchiveEnabled is on (off by default)", () => {
    // 画布增加「收录素材」开关，默认关闭：生成后只在画布预览，不再自动入库。
    expect(canvasSource).toContain("autoArchiveEnabled");
    expect(canvasSource).toContain("if (!canvasDraft.autoArchiveEnabled)");
    expect(canvasSource).toContain('onClick={() => onDraftChange({ autoArchiveEnabled: !canvasDraft.autoArchiveEnabled })}');
    // 两个开关（收录素材 + 完成通知）并排放在生成按钮旁
    expect(canvasSource.indexOf("autoArchiveEnabled")).toBeLessThan(canvasSource.indexOf("notificationEnabled"));
    // 草稿默认值与归一化（canvasGeneration.ts 里 defaultCanvasDraftSettings / normalizeCanvasDraftSettings）
    expect(canvasGenSource).toContain("autoArchiveEnabled: false");
    expect(canvasGenSource).toContain("autoArchiveEnabled: input.autoArchiveEnabled === true");
  });

  it("tracks the result canvas with the creation panel's content height", () => {
    expect(canvasSource).toContain("creationPanelRef");
    expect(canvasSource).toContain("new ResizeObserver(updateHeight)");
    expect(canvasSource).toContain("self-start rounded-3xl border border-border bg-panel");
    expect(canvasSource).toContain("lockedHeight={creationPanelHeight}");
    expect(canvasSource).toContain("style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}");
  });

  it("keeps fullscreen details conditional and actions as circular icon buttons", () => {
    expect(canvasSource).toContain('<Download size={13} />');
    expect(canvasSource).toContain('<Copy size={13} />');
    expect(canvasSource).toContain('<CanvasResultActionButton icon={<Download size={18} />}');
    expect(canvasSource).toContain('icon={<Info size={18} />}');
    expect(canvasSource).toContain('label="查看"');
    expect(canvasSource).toContain('label="复制"');
    expect(canvasSource).toContain('aria-label="展开的提示词"');
    expect(canvasSource).toContain('onCopyImage={onCopyImage}');
    expect(canvasSource).toContain('label="复制"\n            onClick={onCopy}');
    expect(canvasSource).toContain('className="inline-flex size-10 shrink-0 items-center justify-center rounded-full');
    // 操作按钮固定在右侧中部：降低默认不透明度，悬停/聚焦时提高；展开提示词不改变按钮位置。
    expect(canvasSource).toContain('absolute right-3 top-1/2 z-30 flex -translate-y-1/2');
    expect(canvasSource).toContain("opacity-45 transition-opacity hover:opacity-100 focus-within:opacity-100");
    // 大图独立铺满视口居中最大化，与提示词卡片解耦，展开详情时位置与尺寸不变。
    expect(canvasSource).toContain("absolute inset-0 z-0 flex items-center justify-center p-4");
    expect(canvasSource).toContain("block h-auto w-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl");
    expect(canvasSource).toContain("disabled={!result.saved || !result.imageFileName}");
    expect(canvasSource).not.toContain("<Info size={14} /> 查看提示词");
    expect(canvasSource).not.toContain("复用提示词");
    expect(canvasSource).not.toContain('label="复用"');
    // 未点击查看时整块「生成结果」面板不渲染，只保留右侧圆形操作按钮。
    expect(canvasSource).toContain("{promptOpen ? (");
    expect(canvasSource).toContain("absolute right-16 top-1/2 z-20");
  });

  it("adds a manual archive action next to copy in both the hover bar and fullscreen toolbar", () => {
    // 收录图标 (Inbox) 已导入；已收录用 Check 标记，收录中用 LoaderCircle。
    expect(canvasSource).toContain("Inbox,");
    // 悬停工具栏：收录按钮夹在导出与复制之间，已收录/收录中分别置灰转圈。
    expect(canvasSource).toContain('icon={archiving ? <LoaderCircle className="animate-spin" size={13} /> : archived ? <Check size={13} /> : <Inbox size={13} />}');
    expect(canvasSource).toContain('label={archived ? "已收录" : "收录"}');
    expect(canvasSource).toContain('title={archived ? "已收录到素材库" : archiving ? "正在收录到素材库…" : "收录到素材库"}');
    // 全屏预览右侧操作栏也有收录按钮，位于导出与复制之间。
    expect(canvasSource).toContain('icon={archivingIndex === index ? <LoaderCircle className="animate-spin" size={18} /> : result.saved ? <Check size={18} /> : <Inbox size={18} />}');
    // 复制按钮的禁用提示文案改成引导「点击「收录」」而非旧的「开启自动收录」。
    expect(canvasSource).toContain("未收录到素材库，点击「收录」后可复制");
    // 手动收录处理函数与单张入库链路。
    expect(canvasSource).toContain("async function handleArchiveResult");
    expect(canvasSource).toContain("const savedItems = await onImportGeneratedImages(");
    expect(canvasSource).toContain("imageFileName: savedItem.imageFileName, saved: true");
    // 状态：正在收录的索引，用于按钮转圈/置灰。
    expect(canvasSource).toContain("const [archivingIndex, setArchivingIndex] = useState<number | null>(null);");
    // 收录按钮把单张生成图传给入库链路（只传当前这一张 dataUrl，不整批）。
    expect(canvasSource).toContain('[{ dataUrl: result.dataUrl, revisedPrompt: result.revisedPrompt }]');
  });

  it("does not show the 归档中 badge when auto-archive is off (results stay preview-only)", () => {
    // 回归：自动收录默认关闭时 results 永远 saved=false，旧逻辑用 !result.saved 判定
    // 会永久卡住「归档中」角标。新逻辑凭显式 archivingBatch / archiving 才显示角标。
    expect(canvasSource).toContain("const [isArchivingBatch, setIsArchivingBatch] = useState(false);");
    expect(canvasSource).toContain("setIsArchivingBatch(true);");
    expect(canvasSource).toContain("setIsArchivingBatch(false);");
    // 角标判定改为显式条件，不再是 !result.saved。
    expect(canvasSource).toContain("const showArchivingBadge = archiving || (archivingBatch && !archived);");
    expect(canvasSource).toContain("{showArchivingBadge ? (");
    expect(canvasSource).not.toContain("{!result.saved ? (");
    // 自动收录前先置 batch 进行中，完成后在 finally 清掉。
    expect(canvasSource.indexOf("setIsArchivingBatch(true);")).toBeLessThan(
      canvasSource.indexOf("const savedItems = await onImportGeneratedImages(data.images"),
    );
    expect(canvasSource.indexOf("setIsArchivingBatch(false);")).toBeGreaterThan(
      canvasSource.indexOf("const savedItems = await onImportGeneratedImages(data.images"),
    );
  });

  it("lifts the canvas generation state (phase/isGenerating/thinkingKeywords) to the store so switching away and back keeps「创作中」", () => {
    // 回归：切到素材库会卸载 CanvasView，局部 state 全丢；切回时新实例若读局部
    // state 会回退成上一张图。生成态必须提到 zustand store 跨视图保留。
    expect(storeSource).toContain("canvasIsGenerating: boolean;");
    expect(storeSource).toContain("canvasPhase: CanvasPhase;");
    expect(storeSource).toContain("canvasThinkingKeywords: string[];");
    expect(storeSource).toContain("canvasIsGenerating: false,");
    expect(storeSource).toContain('canvasPhase: "empty",');
    expect(storeSource).toContain("canvasThinkingKeywords: [],");
    expect(storeSource).toContain("setCanvasPhase: (phase) => set({ canvasPhase: phase })");
    expect(storeSource).toContain("setCanvasThinkingKeywords: (keywords) => set({ canvasThinkingKeywords: keywords })");
    expect(storeSource).toContain("setCanvasGenerating: (generating) => set({ canvasIsGenerating: generating })");
    // CanvasView 改为从 store 读取，不再 useState 本地持有这些生成态。
    expect(canvasSource).toContain('state.canvasIsGenerating');
    expect(canvasSource).toContain('state.canvasPhase');
    expect(canvasSource).toContain('state.canvasThinkingKeywords');
    expect(canvasSource).toContain("state.setCanvasGenerating");
    expect(canvasSource).toContain("state.setCanvasPhase");
    expect(canvasSource).toContain("state.setCanvasThinkingKeywords");
    // 旧的局部 useState 声明已移除（防止回退）。
    expect(canvasSource).not.toContain("const [isGenerating, setIsGenerating] = useState(false);");
    expect(canvasSource).not.toContain("const [phase, setPhase] = useState<CanvasPhase>(");
    expect(canvasSource).not.toContain("const [thinkingKeywords, setThinkingKeywords] = useState<string[]>([]);");
    // CanvasPhase 类型已从 CanvasView 内联迁到共享 types，供 store 复用。
    expect(canvasSource).toContain("CanvasPhase,");
  });

  it("shows elapsed time after model and dimensions in fullscreen metadata", () => {
    expect(canvasSource).toContain("generationElapsedMs={generationElapsedMs}");
    expect(canvasSource).toContain("<dt>模型：</dt>");
    expect(canvasSource).toContain("<dt>尺寸：</dt>");
    expect(canvasSource).toContain("<dt>用时：</dt>");
    expect(canvasSource).toContain("{promptOpen ? (");
    expect(canvasSource).toContain("rounded-full bg-primary/10 px-2.5 py-1 tabular-nums text-primary");
    expect(canvasSource.indexOf('aria-label="展开的提示词"')).toBeLessThan(canvasSource.indexOf("<dt>模型：</dt>"));
    // 复制提示词按钮放在卡片顶部，低透明度，不挤占底部元信息。
    expect(canvasSource).toContain('aria-label="复制提示词"');
    expect(canvasSource.indexOf('aria-label="复制提示词"')).toBeLessThan(canvasSource.indexOf('aria-label="展开的提示词"'));
    expect(canvasSource).toContain("opacity-40 transition hover:bg-background/40");
    expect(canvasSource).toContain("handleCopyPrompt()");
    expect(canvasSource).toContain("writeClipboardText(text)");
  });
});

describe("canvas draft persistence", () => {
  it("keeps canvas draft in memory immediately and saves it through view settings", () => {
    expect(storeSource).toContain("updateCanvasDraft: (patch) =>");
    expect(storeSource).toContain("set({ canvasDraft: nextCanvasDraft })");
    expect(storeSource).toContain("saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()))");
    expect(viewSettingsSource).toContain("canvasDraft: normalizeCanvasDraftSettings(input.canvasDraft)");
  });
});
