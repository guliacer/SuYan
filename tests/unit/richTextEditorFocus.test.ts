import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync("src/features/prompts/components/PromptEditor.tsx", "utf8");
const createSource = readFileSync("src/features/prompts/components/PromptCreateDialog.tsx", "utf8");

describe("富文本编辑器焦点容器", () => {
  it("不使用 label 包裹包含工具栏按钮的编辑器", () => {
    expect(editorSource).toContain('<section className="grid gap-1.5" aria-labelledby="prompt-editor-content-label">');
    expect(editorSource).toContain('<h3 className="text-sm font-medium" id="prompt-editor-content-label">{t("灵感正文")}</h3>');
    expect(createSource).toContain('<section className="grid gap-1.5" aria-labelledby="prompt-create-content-label">');
    expect(createSource).toContain('<h3 className="text-sm font-medium" id="prompt-create-content-label">{t("灵感正文")}</h3>');
    expect(editorSource).not.toContain('<label className="grid gap-1.5 text-sm font-medium">{t("灵感正文")');
    expect(createSource).not.toContain('<label className="grid gap-1.5 text-sm font-medium">{t("灵感正文")');
  });
});
