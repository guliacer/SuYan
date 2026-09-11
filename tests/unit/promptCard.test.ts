import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync("src/features/prompts/components/PromptCard.tsx", { encoding: "utf8" });
const richCardSource = readFileSync("src/features/prompts/components/PromptCardRichContent.tsx", { encoding: "utf8" });
const detailSource = readFileSync("src/features/prompts/components/PromptDetailDialog.tsx", { encoding: "utf8" });

describe("普通灵感卡片代码块", () => {
  it("renders rich content and retains the card open/select interaction", () => {
    expect(cardSource).toContain("PromptCardRichContent");
    expect(cardSource).toContain("hasPromptCodeFence");
    expect(cardSource).toContain('role="button"');
    expect(cardSource).toContain("handleCardContentClick");
    expect(cardSource).toContain("handleCardContentKeyDown");
  });

  it("adds one IPC-backed copy action for every pre block", () => {
    expect(richCardSource).toContain('new DOMParser().parseFromString(html, "text/html")');
    expect(richCardSource).toContain("renderPromptHtml");
    expect(richCardSource).toContain("window.suyanApi.writeClipboardText(text)");
    expect(richCardSource).toContain('aria-label={translate(status === "copied" ? "已复制代码" : status === "error" ? "复制代码失败，请重试" : "复制代码")}');
    expect(richCardSource).toContain("redactPrompt(codeText)");
    expect(richCardSource).toContain("copyErrorIndex");
    expect(richCardSource).toContain("let nextCodeIndex = 0");
    expect(richCardSource).toContain("setCopyErrorIndex(null);");
  });

  it("keeps the same code copy action in the detail view", () => {
    expect(detailSource).toContain('import { PromptCardRichContent } from "./PromptCardRichContent";');
    expect(detailSource).toContain("<PromptCardRichContent");
    expect(detailSource).toContain("showSensitive={showSensitive}");
    expect(detailSource).not.toContain("function RichPromptContent");
  });
});

describe("灵感卡片尺寸调整", () => {
  it("supports double-click reset and frame-coalesced live resizing", () => {
    expect(cardSource).toContain("PROMPT_CARD_DEFAULT_WIDTH");
    expect(cardSource).toContain("onDoubleClick");
    expect(cardSource).toContain("requestAnimationFrame");
    expect(cardSource).toContain("onSizeChange");
  });
});
