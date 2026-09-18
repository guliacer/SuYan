import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statusToastSource = readFileSync("src/features/library/components/shell/StatusToast.tsx", "utf8");

describe("StatusToast loading feedback", () => {
  it("adds rotating humorous feedback to every persistent processing toast", () => {
    expect(statusToastSource).toContain("const isPending = message.autoDismissMs === null;");
    expect(statusToastSource).toContain('const isProcessing = message.type === "info" && isPending;');
    expect(statusToastSource).toContain("const title = isProcessing ? message.text : getStatusToastTitle(message);");
    expect(statusToastSource).toContain("<RotatingLoadingTip className=\"justify-center status-toast__tip\" kind=\"processing\" />");
    expect(statusToastSource).toContain("import { RotatingLoadingTip } from \"@/components/ui/RotatingLoadingTip\";");
    expect(statusToastSource).not.toContain('return message.autoDismissMs === null ? "正在处理" : "提示";');
    expect(statusToastSource).toContain("isProcessing ? \"text-sm font-black leading-[22px]\"");
    expect(statusToastSource).toContain("!isProcessing ? (");
  });

  it("keeps the toast spacious and above every page overlay", () => {
    expect(statusToastSource).toContain('import { createPortal } from "react-dom";');
    expect(statusToastSource).toContain("document.body");
    expect(statusToastSource).toContain("z-[2147483646]");
    expect(statusToastSource).toContain("min-h-[76px]");
    expect(statusToastSource).toContain("max-w-[20rem]");
    expect(statusToastSource).toContain("px-5 py-3.5");
    expect(statusToastSource).toContain("break-words whitespace-normal");
    expect(statusToastSource).not.toContain("max-w-[14rem]");
    expect(statusToastSource).not.toContain("truncate text-[13px]");
    expect(statusToastSource).not.toContain("truncate text-xs");
  });

  it("uses a restrained theme sheen that respects reduced motion", () => {
    const tokenSource = readFileSync("src/styles/tokens.css", "utf8");
    expect(statusToastSource).toContain("status-toast__text-sheen");
    expect(statusToastSource).toContain("status-toast__tip");
    expect(tokenSource).toContain("@keyframes status-toast-text-sheen");
    expect(tokenSource).toContain("color-mix(in srgb, var(--color-primary) 66%");
    expect(tokenSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(tokenSource).toContain("color: var(--status-toast-sheen-base) !important;");
    expect(tokenSource).toContain(".status-toast__tip .rotating-loading-tip__text");
    expect(tokenSource).toContain("color: var(--color-muted);");
    expect(tokenSource).toContain("max-width: 13rem;");
    expect(tokenSource).toContain("margin-top: 0.35rem;");
    expect(tokenSource).toContain("align-items: center;");
    expect(tokenSource).not.toContain("min-height: 2.2rem;");
  });

  it("keeps rotating loading tips readable instead of forcing one-line ellipsis", () => {
    const tokenSource = readFileSync("src/styles/tokens.css", "utf8");
    const tipBlock = tokenSource.match(/\.rotating-loading-tip__text\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(tipBlock).toContain("overflow-wrap: anywhere;");
    expect(tipBlock).toContain("white-space: normal;");
    expect(tipBlock).not.toContain("text-overflow: ellipsis;");
  });
});
