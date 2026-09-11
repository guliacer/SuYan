import { createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { redactPrompt } from "../utils/promptRedaction";

type Props = {
  html: string;
  className?: string;
  showSensitive?: boolean;
};

const renderableTags = new Set([
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
  "span",
  "strong",
  "u",
  "ul",
]);

/**
 * Renders the already-sanitized card HTML and adds a copy action to each code
 * block. The card remains masked by default, while copying preserves the
 * original code text so commands remain executable.
 */
export function PromptCardRichContent({ html, className = "", showSensitive = false }: Props) {
  const { t } = useLocale();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copyErrorIndex, setCopyErrorIndex] = useState<number | null>(null);

  const copyCode = useCallback(async (index: number, text: string): Promise<void> => {
    if (!text.trim()) return;
    try {
      const result = await window.suyanApi.writeClipboardText(text);
      if (result.ok) {
        setCopiedIndex(index);
        setCopyErrorIndex(null);
      } else {
        setCopiedIndex(null);
        setCopyErrorIndex(index);
      }
    } catch {
      setCopiedIndex(null);
      setCopyErrorIndex(index);
    }
  }, []);

  useEffect(() => {
    setCopiedIndex(null);
    setCopyErrorIndex(null);
  }, [html]);

  useEffect(() => {
    if (copiedIndex === null) return;
    const timer = window.setTimeout(() => setCopiedIndex(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedIndex]);

  const renderedContent = useMemo(
    () => renderPromptHtml(html, copyCode, copiedIndex, copyErrorIndex, showSensitive, t),
    [html, copyCode, copiedIndex, copyErrorIndex, showSensitive, t],
  );

  return (
    <div
      className={`prompt-card-rich-content break-words text-[13px] leading-5 text-muted [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-2 [&_code]:font-mono [&_h1]:my-1.5 [&_h1]:font-semibold [&_h2]:my-1.5 [&_h2]:font-semibold [&_h3]:my-1.5 [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-h-40 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1 [&_pre]:relative [&_pre]:my-1.5 [&_pre]:max-h-40 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-background [&_pre]:p-2.5 [&_pre]:pr-11 [&_pre]:whitespace-pre-wrap ${className}`}
    >
      {renderedContent}
    </div>
  );
}

function renderPromptHtml(
  html: string,
  onCopy: (index: number, text: string) => void,
  copiedIndex: number | null,
  copyErrorIndex: number | null,
  showSensitive: boolean,
  translate: (text: string) => string,
): ReactNode[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let nextCodeIndex = 0;

  const renderNode = (node: ChildNode, key: string): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      return showSensitive ? text : redactPrompt(text);
    }
    if (!(node instanceof Element)) return null;

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`));
    if (!renderableTags.has(tag)) return children;

    if (tag === "pre") {
      const codeText = node.querySelector("code")?.textContent ?? node.textContent ?? "";
      const index = nextCodeIndex;
      nextCodeIndex += 1;
      const codeElement = node.querySelector("code");
      const codeProps = codeElement ? toReactProps(codeElement) : {};
      const status = copiedIndex === index ? "copied" : copyErrorIndex === index ? "error" : "idle";
      return (
        <pre key={key} {...toReactProps(node)}>
          <code {...codeProps}>{showSensitive ? codeText : redactPrompt(codeText)}</code>
          <button
            aria-label={translate(status === "copied" ? "已复制代码" : status === "error" ? "复制代码失败，请重试" : "复制代码")}
            className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md border border-border/70 bg-panel/85 shadow-sm transition-colors hover:bg-primary-soft hover:text-foreground ${status === "error" ? "text-danger" : "text-muted"}`}
            title={translate(status === "copied" ? "已复制代码" : status === "error" ? "复制代码失败，请重试" : "复制代码")}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(index, codeText);
            }}
          >
            {status === "copied" ? <Check size={13} /> : status === "error" ? <AlertCircle size={13} /> : <Copy size={13} />}
          </button>
        </pre>
      );
    }

    if (tag === "br" || tag === "img") return createElement(tag, { ...toReactProps(node), key });
    return createElement(tag, { ...toReactProps(node), key }, children);
  };

  return Array.from(parsed.body.childNodes).map((node, index) => renderNode(node, `prompt-rich-${index}`));
}

function toReactProps(element: Element): Record<string, string> {
  const props: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    props[attribute.name === "class" ? "className" : attribute.name] = attribute.value;
  }
  return props;
}
