import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");
const promptDetailDialogPath = path.join(
  projectRoot,
  "src",
  "features",
  "library",
  "components",
  "PromptDetailDialog.tsx",
);
const libraryViewPath = path.join(projectRoot, "src", "features", "library", "components", "LibraryView.tsx");

describe("PromptDetailDialog prompt actions", () => {
  it("places prompt transfer after copy in the three-column footer", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");
    const footerStart = source.indexOf('<footer className="mt-4 grid shrink-0 grid-cols-3');
    const footerEnd = source.indexOf("</footer>", footerStart);

    expect(footerStart).toBeGreaterThanOrEqual(0);
    expect(footerEnd).toBeGreaterThan(footerStart);

    const footer = source.slice(footerStart, footerEnd);
    const copyIndex = footer.indexOf("复制提示词");
    const transferIndex = footer.indexOf("传送到画布");

    expect(copyIndex).toBeGreaterThanOrEqual(0);
    expect(transferIndex).toBeGreaterThan(copyIndex);
    expect(footer).toContain("onPushPromptToCanvas(promptDraft, negativePromptDraft)");
  });

  it("always routes detail sharing to the ZIP export callback", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");
    const footerStart = source.indexOf('<footer className="mt-4 grid shrink-0 grid-cols-3');
    const footerEnd = source.indexOf("</footer>", footerStart);
    const footer = source.slice(footerStart, footerEnd);

    expect(source).toContain("onShareGroup: () => void;");
    expect(footer).toContain("onClick={onShareGroup}");
    expect(footer).toContain('{imageCount > 1 ? t("分享本组") : t("分享")}');
    expect(source).not.toContain("onShareText");
    expect(source).not.toContain("buildShareText");
  });

  it("does not keep a prompt transfer button in the top prompt toolbar", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");

    expect(source).not.toContain('ariaLabel={isCurrentMediaVideo ? "视频不支持传送到画布" : "传送到画布"}');
    expect(source).toContain('ariaLabel={t("传送到画布")}');
    expect(source).toContain("onClick={() => void onPushToCanvas(promptDraft, negativePromptDraft)}");
  });

  it("keeps the material detail page independent from the todo store", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");

    expect(source).not.toContain("useTodoStore");
    expect(source).not.toContain("onAddToTodo");
    expect(source).not.toContain("加入待办");
  });

  it("transfers the image and both prompt fields in one canvas draft update", () => {
    const source = fs.readFileSync(libraryViewPath, "utf8");

    expect(source).toContain("const transferredPrompt = splitNegativePromptFromPrompt(prompt, negativePrompt);");
    expect(source).toContain("prompt: transferredPrompt.prompt,");
    expect(source).toContain("negativePrompt: transferredPrompt.negativePrompt,");
    expect(source).toContain("negativePromptHidden: true,");
    expect(source).toContain("setCanvasPromptUndoSnapshot({");
    expect(source).toContain("referenceImages: [...canvasDraft.referenceImages, newEntry],");
    expect(source).toContain("onPushToCanvas={(prompt, negativePrompt) => void pushImageToCanvas(detailItem, prompt, negativePrompt)}");
  });

  it("clears stale negative prompt text when transferring a positive-only prompt", () => {
    const source = fs.readFileSync(libraryViewPath, "utf8");

    expect(source).toContain('import { sanitizePromptTags, splitNegativePromptFromPrompt } from "../utils/promptAnalysis";');
    expect(source).toContain("function pushPromptToCanvas(item: PromptCardData, prompt: string, negativePrompt: string)");
    expect(source).toContain("negativePrompt: transferredPrompt.negativePrompt,");
    expect(source).toContain("negativePromptHidden: true,");
    expect(source).not.toContain("if (negativePrompt.trim()) {");
  });

  it("forces video detail analysis to use the prompt source", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");

    expect(source).toContain("const isCurrentMediaVideoFile = Boolean(item.imageFileName && isVideoMediaFile(item.imageFileName));");
    expect(source).toContain('if (isCurrentMediaVideoFile) {\n      return "prompt";');
    expect(source).toContain("allowImageSource={!isCurrentMediaVideoFile}");
    expect(source).toContain('视频仅支持文本分析');
    expect(fs.readFileSync(libraryViewPath, "utf8")).toContain("key={detailItem.id}");
  });

  it("registers manually entered categories before persisting secondary genre ids", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");
    const librarySource = fs.readFileSync(libraryViewPath, "utf8");

    expect(source).toContain("onUpsertCustomCategory?:");
    expect(source).toContain("if (!categoryId && onUpsertCustomCategory)");
    expect(source).toContain('group: "自定义分类"');
    expect(source).toContain("await onUpsertCustomCategory");
    expect(source).toContain("await enqueueDetailSave({");
    expect(source).toContain("detailSaveChainRef");
    expect(source).toContain("categoryCommitChainRef");
    expect(source).toContain("pendingCategoryChipsRef");
    expect(librarySource).toContain("onUpsertCustomCategory={upsertCustomCategory}");
  });
});
