import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  Eraser,
  Eye,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Redo2,
  Replace,
  Search,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import {
  extractPromptText,
  getPromptContentImageSrc,
  plainTextToPromptHtml,
  preparePromptHtmlForRender,
  sanitizePromptHtml,
} from "../utils/promptRichText";
import { findPromptTextMatches, type PromptTextMatch } from "../utils/promptFindReplace";
import { PromptCardRichContent } from "./PromptCardRichContent";

type Props = {
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  onChange: (html: string, text: string) => void;
};

type ToolbarButtonProps = {
  label: string;
  onAction: () => void;
  children: React.ReactNode;
  disabled?: boolean;
};

export function RichTextEditor({ value, disabled = false, autoFocus = false, placeholder, onChange }: Props) {
  const { t } = useLocale();
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(() => !extractPromptText(value));
  const [imageState, setImageState] = useState<"idle" | "loading">("idle");
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = value.trim() ? preparePromptHtmlForRender(value) : "";
    if (sanitizePromptHtml(editor.innerHTML) !== sanitizePromptHtml(nextHtml)) {
      editor.innerHTML = nextHtml;
    }
    setIsEmpty(!extractPromptText(nextHtml));
  }, [mode, value]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!findOpen) return;
    (replaceOpen ? replaceInputRef.current : findInputRef.current)?.focus();
  }, [findOpen, replaceOpen]);

  useEffect(() => {
    setActiveMatch(0);
  }, [caseSensitive, findQuery, value]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      const command = event.ctrlKey || event.metaKey;
      if (!command || mode === "preview" || !editorShellRef.current?.contains(document.activeElement)) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen((open) => !open);
        setReplaceOpen(false);
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        setFindOpen(true);
        setReplaceOpen(true);
      }
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [mode]);

  function rememberSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current?.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection(): void {
    const editor = editorRef.current;
    const range = selectionRef.current;
    if (!editor || !range) {
      editor?.focus();
      return;
    }
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function syncValue(): void {
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizePromptHtml(editor.innerHTML);
    setIsEmpty(!extractPromptText(html));
    onChange(html, extractPromptText(html));
    rememberSelection();
  }

  function currentMatches(): PromptTextMatch[] {
    const editor = editorRef.current;
    return editor ? findPromptTextMatches(editor.textContent ?? "", findQuery, caseSensitive) : [];
  }

  function selectMatch(index: number): void {
    const editor = editorRef.current;
    if (!editor) return;
    const matches = currentMatches();
    if (!matches.length) return;
    const nextIndex = ((index % matches.length) + matches.length) % matches.length;
    const range = rangeForTextOffsets(editor, matches[nextIndex]);
    if (!range) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    selectionRef.current = range.cloneRange();
    setActiveMatch(nextIndex);
    const scrollTarget = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    scrollTarget?.scrollIntoView({ block: "nearest" });
  }

  function replaceCurrent(): void {
    const editor = editorRef.current;
    const matches = currentMatches();
    const match = matches[activeMatch];
    if (!editor || !match) return;
    if (!replaceTextRange(editor, match, replaceValue)) return;
    syncValue();
    const remaining = currentMatches();
    setActiveMatch(Math.min(activeMatch, Math.max(0, remaining.length - 1)));
  }

  function replaceAll(): void {
    const editor = editorRef.current;
    const matches = currentMatches();
    if (!editor || !matches.length) return;
    for (const match of [...matches].reverse()) replaceTextRange(editor, match, replaceValue);
    syncValue();
    setActiveMatch(0);
  }

  function execute(command: string, valueArg?: string): void {
    restoreSelection();
    document.execCommand(command, false, valueArg);
    syncValue();
  }

  async function insertImage(): Promise<void> {
    rememberSelection();
    setImageState("loading");
    try {
      const result = await window.suyanApi.choosePromptContentImage();
      if (!result.ok || result.data.canceled || !result.data.imageFileName) return;
      insertImageFile(result.data.imageFileName);
    } finally {
      setImageState("idle");
    }
  }

  function insertImageFile(fileName: string): void {
    restoreSelection();
    const imageHtml = `<img src="${getPromptContentImageSrc(fileName)}" data-prompt-image="${fileName}" alt="${t("插入图片")}" />`;
    document.execCommand("insertHTML", false, imageHtml);
    syncValue();
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    rememberSelection();
    const payload = await window.suyanApi.readPromptClipboard();
    if (!payload.ok) return;

    if (payload.data.imageDataUrl) {
      setImageState("loading");
      try {
        const imageResult = await window.suyanApi.savePromptContentImage(payload.data.imageDataUrl);
        if (imageResult.ok && imageResult.data.imageFileName) insertImageFile(imageResult.data.imageFileName);
      } finally {
        setImageState("idle");
      }
      return;
    }

    restoreSelection();
    if (payload.data.html?.trim()) {
      document.execCommand("insertHTML", false, sanitizePromptHtml(payload.data.html));
    } else if (payload.data.text) {
      document.execCommand("insertText", false, payload.data.text);
    }
    syncValue();
  }

  function createLink(): void {
    const url = window.prompt(t("输入链接地址"), "https://");
    if (url?.trim()) execute("createLink", url.trim());
  }

  function handleFindKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      selectMatch(activeMatch + (event.shiftKey ? -1 : 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFindOpen(false);
      setReplaceOpen(false);
    }
  }

  function handleReplaceKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      replaceCurrent();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFindOpen(false);
      setReplaceOpen(false);
    }
  }

  function toggleMode(): void {
    setFindOpen(false);
    setReplaceOpen(false);
    setMode((current) => current === "edit" ? "preview" : "edit");
  }

  const button = (label: string, children: React.ReactNode, onAction: () => void, extraDisabled = false) => (
    <ToolbarButton disabled={disabled || extraDisabled} label={t(label)} onAction={onAction}>
      {children}
    </ToolbarButton>
  );

  return (
    <div ref={editorShellRef} className={`overflow-hidden rounded-xl border border-border bg-panel transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background/70 px-2 py-1.5" role="toolbar" aria-label={t("正文格式工具栏")}>
        {button("撤销", <Undo2 size={16} />, () => execute("undo"))}
        {button("重做", <Redo2 size={16} />, () => execute("redo"))}
        <ToolbarSeparator />
        <ToolbarButton label={t(findOpen ? "关闭查找" : "查找")} onAction={() => { setFindOpen((open) => !open); setReplaceOpen(false); }} disabled={disabled || mode === "preview"}>
          {findOpen ? <X size={16} /> : <Search size={16} />}
        </ToolbarButton>
        <ToolbarButton label={t("查找与替换")} onAction={() => { setFindOpen(true); setReplaceOpen(true); }} disabled={disabled || mode === "preview"}>
          <Replace size={16} />
        </ToolbarButton>
        <ToolbarButton label={t(mode === "edit" ? "预览正文" : "继续编辑")} onAction={toggleMode} disabled={disabled}>
          {mode === "edit" ? <Eye size={16} /> : <Pencil size={16} />}
        </ToolbarButton>
        <ToolbarSeparator />
        {button("标题", <span className="text-xs font-semibold">H</span>, () => execute("formatBlock", "h2"))}
        {button("粗体", <Bold size={16} />, () => execute("bold"))}
        {button("斜体", <Italic size={16} />, () => execute("italic"))}
        {button("下划线", <Underline size={16} />, () => execute("underline"))}
        {button("删除线", <Strikethrough size={16} />, () => execute("strikeThrough"))}
        <ToolbarSeparator />
        {button("引用", <Quote size={16} />, () => execute("formatBlock", "blockquote"))}
        {button("代码", <Code2 size={16} />, () => execute("formatBlock", "pre"))}
        {button("项目符号", <List size={16} />, () => execute("insertUnorderedList"))}
        {button("编号列表", <ListOrdered size={16} />, () => execute("insertOrderedList"))}
        <ToolbarSeparator />
        {button("左对齐", <AlignLeft size={16} />, () => execute("justifyLeft"))}
        {button("居中", <AlignCenter size={16} />, () => execute("justifyCenter"))}
        {button("右对齐", <AlignRight size={16} />, () => execute("justifyRight"))}
        {button("插入链接", <Link2 size={16} />, createLink)}
        {button("插入图片", <ImagePlus size={16} />, () => void insertImage(), imageState === "loading")}
        {button("清除格式", <Eraser size={16} />, () => execute("removeFormat"))}
      </div>
      {findOpen && mode === "edit" ? <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/50 px-2 py-2" role="search" aria-label={t("正文查找")}>
        <div className="flex min-w-[180px] flex-1 items-center gap-1.5">
          <Search className="shrink-0 text-muted" size={15} />
          <input
            ref={findInputRef}
            aria-label={t("查找内容")}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-panel px-2 text-sm outline-none focus:border-primary"
            placeholder={t("查找正文")}
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={handleFindKeyDown}
          />
        </div>
        <span className="min-w-[56px] text-center text-xs text-muted" aria-live="polite">{formatMatchCount(currentMatches().length, activeMatch, t)}</span>
        <button aria-label={t("上一个匹配")} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-40" disabled={!currentMatches().length} title={t("上一个匹配")} type="button" onClick={() => selectMatch(activeMatch - 1)}><ChevronUp size={16} /></button>
        <button aria-label={t("下一个匹配")} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-40" disabled={!currentMatches().length} title={t("下一个匹配")} type="button" onClick={() => selectMatch(activeMatch + 1)}><ChevronDown size={16} /></button>
        <button aria-pressed={caseSensitive} aria-label={t("区分大小写")} className={`flex h-8 items-center rounded-md px-2 text-xs ${caseSensitive ? "bg-primary-soft text-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"}`} title={t("区分大小写")} type="button" onClick={() => setCaseSensitive((value) => !value)}>Aa</button>
        <button aria-label={t(replaceOpen ? "收起替换" : "展开替换")} className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-primary-soft hover:text-foreground" title={t(replaceOpen ? "收起替换" : "展开替换")} type="button" onClick={() => setReplaceOpen((open) => !open)}><Replace size={14} />{t("替换")}</button>
        {replaceOpen ? <div className="flex min-w-[220px] flex-[1_1_100%] items-center gap-1.5 pl-6">
          <Replace className="shrink-0 text-muted" size={15} />
          <input
            ref={replaceInputRef}
            aria-label={t("替换为")}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-panel px-2 text-sm outline-none focus:border-primary"
            placeholder={t("替换为")}
            value={replaceValue}
            onChange={(event) => setReplaceValue(event.target.value)}
            onKeyDown={handleReplaceKeyDown}
          />
          <button className="h-8 rounded-md px-2 text-xs text-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-40" disabled={!currentMatches().length} type="button" onClick={replaceCurrent}>{t("替换")}</button>
          <button className="h-8 rounded-md px-2 text-xs text-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-40" disabled={!currentMatches().length} type="button" onClick={replaceAll}>{t("全部替换")}</button>
        </div> : null}
      </div> : null}
      <div className="relative">
        {mode === "edit" ? <>
        {isEmpty ? <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted">{placeholder ?? t("粘贴或输入灵感…")}</span> : null}
        <div
          ref={editorRef}
          aria-label={t("灵感正文编辑器")}
          className="min-h-56 max-h-[min(520px,48dvh)] overflow-y-auto p-3 text-sm leading-6 text-foreground outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:font-mono [&_h2]:my-2 [&_h2]:text-lg [&_h2]:font-semibold [&_img]:my-2 [&_img]:max-h-96 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:ml-5 [&_p]:min-h-6 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background [&_pre]:p-3 [&_ul]:list-disc [&_ol]:list-decimal"
          contentEditable={!disabled}
          role="textbox"
          spellCheck
          suppressContentEditableWarning
          onBlur={rememberSelection}
          onInput={syncValue}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onPaste={(event) => void handlePaste(event)}
        />
        </> : (
          <PromptCardRichContent
            className="min-h-56 max-h-[min(520px,48dvh)] overflow-y-auto p-3 text-sm leading-6 [&_blockquote]:my-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_img]:my-3 [&_img]:max-h-96 [&_pre]:my-2 [&_pre]:max-h-none [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background [&_pre]:p-3"
            html={value.trim() ? preparePromptHtmlForRender(value) : `<p>${t("暂无正文")}</p>`}
            showSensitive
          />
        )}
      </div>
    </div>
  );
}

function formatMatchCount(count: number, activeIndex: number, translate: (text: string) => string): string {
  return count ? `${Math.min(activeIndex + 1, count)}/${count}` : translate("无匹配");
}

function rangeForTextOffsets(root: HTMLElement, match: PromptTextMatch): Range | null {
  const textNodes = collectTextNodes(root);
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const item of textNodes) {
    if (!startNode && match.start >= item.start && match.start <= item.end) {
      startNode = item.node;
      startOffset = match.start - item.start;
    }
    if (match.end >= item.start && match.end <= item.end) {
      endNode = item.node;
      endOffset = match.end - item.start;
      break;
    }
  }
  if (!startNode || !endNode) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function replaceTextRange(root: HTMLElement, match: PromptTextMatch, replacement: string): boolean {
  const range = rangeForTextOffsets(root, match);
  if (!range) return false;
  range.deleteContents();
  range.insertNode(root.ownerDocument.createTextNode(replacement));
  return true;
}

function collectTextNodes(root: HTMLElement): Array<{ node: Text; start: number; end: number }> {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const end = cursor + textNode.data.length;
    nodes.push({ node: textNode, start: cursor, end });
    cursor = end;
    node = walker.nextNode();
  }
  return nodes;
}

function ToolbarButton({ label, onAction, children, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      title={label}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onAction();
      }}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />;
}

export function promptEditorHtmlFromText(text: string): string {
  return plainTextToPromptHtml(text);
}
