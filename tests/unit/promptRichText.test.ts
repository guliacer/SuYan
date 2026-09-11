import { describe, expect, it } from "vitest";
import {
  extractPromptImageNames,
  extractPromptText,
  hasPromptCodeFence,
  isCommandPrompt,
  plainTextToPromptHtml,
  preparePromptHtmlForRender,
  sanitizePromptHtml,
} from "../../src/features/prompts/utils/promptRichText";

describe("灵感富文本", () => {
  it("只保留允许的格式并移除脚本和不安全图片地址", () => {
    const html = sanitizePromptHtml(
      '<p>前文</p><script>alert(1)</script><strong>重点</strong><img src="javascript:alert(1)" data-prompt-image="safe.png"><a href="javascript:alert(1)">链接</a>',
    );

    expect(html).toContain("<p>前文</p>");
    expect(html).toContain("<strong>重点</strong>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('data-prompt-image="safe.png"');
  });

  it("保留图片在正文中的顺序和位置", () => {
    const html = '<p>图片前</p><img data-prompt-image="one.png" alt="参考图" /><p>图片后</p>';

    expect(extractPromptImageNames(html)).toEqual(["one.png"]);
    expect(extractPromptText(html)).toBe("图片前\n参考图\n图片后");
    expect(preparePromptHtmlForRender(html)).toContain('src="app-image://prompt/one.png"');
  });

  it("可将旧的纯文本正文转换为编辑器内容", () => {
    expect(plainTextToPromptHtml("第一行\n第二行")).toBe("<p>第一行</p><p>第二行</p>");
  });

  it("识别 Markdown 命令围栏并保留语言和命令内容", () => {
    const source = [
      "可以，按下面操作。",
      "```text",
      "W:\\Guli Identity\\dist",
      "```",
      "```bash",
      "cd ~",
      "sha256sum -c release.sha256",
      "```",
    ].join("\n");
    const html = plainTextToPromptHtml(source);

    expect(html).toContain('<pre data-language="text"><code>W:\\Guli Identity\\dist</code></pre>');
    expect(html).toContain('<pre data-language="bash"><code>cd ~\nsha256sum -c release.sha256</code></pre>');
    expect(html).not.toContain("```bash");
    expect(isCommandPrompt(source)).toBe(true);
    expect(hasPromptCodeFence(source)).toBe(true);
  });

  it("识别 PowerShell 围栏且不会放行不安全属性", () => {
    const html = sanitizePromptHtml('<pre data-language="PowerShell"><code class="language-powershell">Get-ChildItem</code></pre>');
    expect(html).toContain('data-language="powershell"');
    expect(html).toContain('class="language-powershell"');
    expect(sanitizePromptHtml('<pre data-language=""><code class="language-<script>">x</code></pre>')).not.toContain("data-language");
  });
});
