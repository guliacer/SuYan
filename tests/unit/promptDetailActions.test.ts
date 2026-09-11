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

    expect(source).toContain("prompt,");
    expect(source).toContain("negativePrompt,");
    expect(source).toContain("referenceImages: [...canvasDraft.referenceImages, newEntry],");
    expect(source).toContain("onPushToCanvas={(prompt, negativePrompt) => void pushImageToCanvas(detailItem, prompt, negativePrompt)}");
  });

  it("forces video detail analysis to use the prompt source", () => {
    const source = fs.readFileSync(promptDetailDialogPath, "utf8");

    expect(source).toContain("const isCurrentMediaVideoFile = Boolean(item.imageFileName && isVideoMediaFile(item.imageFileName));");
    expect(source).toContain('if (isCurrentMediaVideoFile) {\n      return "prompt";');
    expect(source).toContain("allowImageSource={!isCurrentMediaVideoFile}");
    expect(source).toContain('视频仅支持文本分析');
    expect(fs.readFileSync(libraryViewPath, "utf8")).toContain("key={detailItem.id}");
  });
});
