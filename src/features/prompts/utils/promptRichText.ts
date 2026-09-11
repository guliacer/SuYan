const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "u",
  "ul",
]);

const voidTags = new Set(["br", "img"]);
/**
 * Rich text is stored as a small, deliberately restricted HTML subset. The
 * renderer also calls this function before inserting clipboard HTML, while
 * the main process calls it again at the IPC boundary.
 */
export function sanitizePromptHtml(input: string): string {
  if (!input.trim()) return "";

  const source = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  return source.replace(/<\/?([a-z][\w-]*)([^>]*)>/gi, (full, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (full.startsWith("</")) return voidTags.has(tag) ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";

    const attributes = sanitizeAttributes(tag, rawAttributes);
    return `<${tag}${attributes ? ` ${attributes}` : ""}${voidTags.has(tag) ? " />" : ">"}`;
  });
}

export function plainTextToPromptHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let fence: { marker: string; language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(...paragraph.map((line) => `<p>${renderInlineMarkdown(line) || "<br>"}</p>`));
    paragraph = [];
  };

  for (const line of lines) {
    const opening = parseFence(line);
    if (opening) {
      if (!fence) {
        flushParagraph();
        fence = { marker: opening.marker, language: opening.language, lines: [] };
      } else if (line.trim().startsWith(opening.marker[0].repeat(fence.marker.length))) {
        blocks.push(renderPromptCodeBlock(fence.lines.join("\n"), fence.language));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (fence) {
      fence.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      const level = Math.min(6, heading[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line.trim());
    if (quote) {
      flushParagraph();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1]) || "<br>"}</blockquote>`);
      continue;
    }
    paragraph.push(line);
  }

  if (fence) blocks.push(renderPromptCodeBlock(fence.lines.join("\n"), fence.language));
  flushParagraph();
  return blocks.join("");
}

/**
 * Detects pasted command-oriented documents so the automatic AI organizer can
 * keep the original command text and formatting instead of generating prose.
 */
export function isCommandPrompt(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let commandFence = false;
  for (const line of lines) {
    const fence = parseFence(line);
    if (fence) {
      if (fence.language === "bash" || fence.language === "shell" || fence.language === "powershell" || fence.language === "cmd") {
        commandFence = true;
      }
      continue;
    }
    if (/^\s*(?:cd|dir|ls|pwd|git|npm|pnpm|yarn|curl|wget|sha256sum|tar|ssh|scp|chmod|chown|docker|python|python3|node|ffmpeg|openssl|sudo|apt(?:-get)?|mkdir|cp|mv|rm|set|export|where|powershell|pwsh|bash|sh)\b/i.test(line)) {
      commandFence = true;
    }
  }
  return commandFence;
}

export function hasPromptCodeFence(text: string): boolean {
  return /(^|\n)\s{0,3}(?:`{3,}|~{3,})/.test(text);
}

export function extractPromptText(html: string): string {
  const withImages = html.replace(/<img\b([^>]*)>/gi, (_full, attributes: string) => {
    const alt = readAttribute(attributes, "alt");
    return `${alt?.trim() || "[图片]"}\n`;
  });
  const withBreaks = withImages
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:blockquote|div|h1|h2|h3|li|p|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPromptImageNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const fileName = readAttribute(match[1], "data-prompt-image");
    if (fileName && isPromptImageFileName(fileName)) names.add(fileName);
  }
  return [...names];
}

export function preparePromptHtmlForRender(html: string): string {
  const sanitized = sanitizePromptHtml(html);
  return sanitized.replace(/<img\b([^>]*)>/gi, (_full, attributes: string) => {
    const fileName = readAttribute(attributes, "data-prompt-image");
    if (!fileName || !isPromptImageFileName(fileName)) return "<span>[图片]</span>";
    const withoutImageAttributes = attributes.replace(/\s+(?:src|data-prompt-image)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<img${withoutImageAttributes} src="${getPromptContentImageSrc(fileName)}" data-prompt-image="${escapeAttribute(fileName)}" />`;
  });
}

export function getPromptContentImageSrc(fileName: string): string {
  return `app-image://prompt/${encodeURIComponent(fileName)}`;
}

export function isPromptImageFileName(fileName: string): boolean {
  return /^[^\\/:*?"<>|\x00-\x1f]+\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico)$/i.test(fileName)
    && fileName.length <= 240;
}

function sanitizeAttributes(tag: string, rawAttributes: string): string {
  const output: string[] = [];
  const pattern = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of rawAttributes.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name === "data-prompt-image" && tag === "img" && isPromptImageFileName(value)) {
      output.push(`data-prompt-image="${escapeAttribute(value)}"`);
    } else if (name === "src" && tag === "img" && isPromptImageSrc(value)) {
      output.push(`src="${escapeAttribute(value)}"`);
    } else if (name === "alt" && tag === "img") {
      output.push(`alt="${escapeAttribute(value.slice(0, 200))}"`);
    } else if ((name === "width" || name === "height") && tag === "img" && /^\d{1,4}$/.test(value)) {
      output.push(`${name}="${value}"`);
    } else if (name === "href" && tag === "a" && /^(?:https?:|mailto:)/i.test(value)) {
      output.push(`href="${escapeAttribute(value)}"`);
    } else if (name === "data-language" && tag === "pre" && /^[\w+#.-]{1,32}$/i.test(value)) {
      output.push(`data-language="${escapeAttribute(value.toLowerCase())}"`);
    } else if (name === "class" && tag === "code") {
      const languageClass = value.match(/(?:^|\s)language-([\w+#.-]{1,32})(?:\s|$)/i)?.[1];
      if (languageClass) output.push(`class="language-${escapeAttribute(languageClass.toLowerCase())}"`);
    }
  }
  return output.join(" ");
}

function isPromptImageSrc(value: string): boolean {
  return /^app-image:\/\/prompt\/[A-Za-z0-9._~%!()-]+$/i.test(value);
}

function readAttribute(attributes: string, name: string): string | null {
  const expression = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = expression.exec(attributes);
  return match ? match[1] ?? match[2] ?? match[3] ?? null : null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function parseFence(line: string): { marker: string; language: string } | null {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`~]+)?[^`~]*$/.exec(line);
  if (!match) return null;
  return { marker: match[1], language: normalizeCodeLanguage(match[2] ?? "") };
}

function normalizeCodeLanguage(value: string): string {
  const language = value.trim().toLowerCase();
  if (!language || /^(?:plain|plaintext|text|txt|纯文本)$/.test(language)) return "text";
  if (/^(?:bash|sh|shell|zsh|fish)$/.test(language)) return language === "sh" ? "shell" : language;
  if (/^(?:powershell|pwsh|ps|ps1)$/.test(language)) return "powershell";
  if (/^(?:cmd|bat|batch|dos)$/.test(language)) return "cmd";
  return language.slice(0, 32);
}

function renderPromptCodeBlock(code: string, language: string): string {
  return `<pre data-language="${escapeAttribute(language)}"><code>${escapeHtml(code)}</code></pre>`;
}

function renderInlineMarkdown(value: string): string {
  let output = escapeHtml(value);
  output = output.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_full, label: string, href: string) => `<a href="${escapeAttribute(href)}">${label}</a>`);
  output = output.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  output = output.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return output;
}
