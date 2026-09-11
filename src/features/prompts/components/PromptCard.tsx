import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Copy, GripVertical, ListPlus, Maximize2, Pencil, Star, Trash2 } from "lucide-react";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import { useLocale } from "@/components/LocaleProvider";
import type { PromptCategory, PromptEntry } from "../types";
import { getPromptColor } from "../utils/promptColors";
import { redactPrompt } from "../utils/promptRedaction";
import { hasPromptCodeFence, plainTextToPromptHtml, preparePromptHtmlForRender } from "../utils/promptRichText";
import { GithubProjectContent } from "./GithubProjectContent";
import { PromptCardRichContent } from "./PromptCardRichContent";
import {
  clampPromptCardHeight,
  clampPromptCardWidth,
  PROMPT_CARD_DEFAULT_HEIGHT,
  PROMPT_CARD_DEFAULT_WIDTH,
} from "../utils/promptCardSizing";

type Props = {
  category?: PromptCategory;
  entry: PromptEntry;
  selected: boolean;
  selectionMode: boolean;
  onCopy: () => void;
  onAddToTodo?: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onGithubReadmeCollapsed?: (collapsed: boolean) => void | Promise<boolean>;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onResize?: (size: { width: number; height: number }) => void | boolean | Promise<boolean>;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
};

export function getPromptCardToneClassNames(color: string) {
  const tone = CAPSULE_TONES[color as keyof typeof CAPSULE_TONES] ?? CAPSULE_TONES.primary;
  return {
    article: tone.borderHover,
    header: tone.solid,
    button: tone.buttonOutline,
    tag: tone.solid,
  };
}

export function PromptCard({ category, entry, selected, selectionMode, onCopy, onAddToTodo, onOpen, onEdit, onDelete, onSelect, onToggleFavorite, onGithubReadmeCollapsed, onSizeChange, onResize, dragHandleProps }: Props) {
  const { t } = useLocale();
  const color = getPromptColor(entry.id, entry.colorId);
  const tone = getPromptCardToneClassNames(color);
  const [size, setSize] = useState(() => ({
    width: clampPromptCardWidth(entry.cardWidth ?? PROMPT_CARD_DEFAULT_WIDTH),
    height: clampPromptCardHeight(entry.cardHeight ?? PROMPT_CARD_DEFAULT_HEIGHT),
  }));
  const sizeRef = useRef(size);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{
    startSize: { width: number; height: number };
    nextSize: { width: number; height: number };
  } | null>(null);
  const safeDescription = entry.description ? redactPrompt(entry.description) : "";
  const cardContent = entry.type === "account"
    ? [
        entry.account?.site ? `${t("网址")}: ${entry.account.site}` : "",
        entry.account?.name ? `${t("账户")}: ${entry.account.name}` : "",
      ].filter(Boolean).join("\n") || t("账号配置")
    : entry.content;
  const safeContent = redactPrompt(cardContent);
  const isGithubProject = entry.type === "github-project" && Boolean(entry.github);
  const richContentHtml = entry.contentHtml?.trim()
    ? preparePromptHtmlForRender(entry.contentHtml)
    : hasPromptCodeFence(entry.content)
      ? preparePromptHtmlForRender(plainTextToPromptHtml(entry.content))
      : "";

  useEffect(() => {
    // 旧条目可能没有尺寸字段。只同步已经持久化的维度，避免一次普通重渲染
    // 把拖拽中的尺寸用默认值覆盖。
    setSize((current) => {
      const next = {
      width: typeof entry.cardWidth === "number" && Number.isFinite(entry.cardWidth)
        ? clampPromptCardWidth(entry.cardWidth)
        : current.width,
      height: typeof entry.cardHeight === "number" && Number.isFinite(entry.cardHeight)
        ? clampPromptCardHeight(entry.cardHeight)
        : current.height,
      };
      sizeRef.current = next;
      return next;
    });
  }, [entry.cardHeight, entry.cardWidth]);

  function applySize(nextSize: { width: number; height: number }) {
    sizeRef.current = nextSize;
    setSize(nextSize);
    onSizeChange?.(nextSize);
  }

  function resetSize() {
    const defaultSize = { width: PROMPT_CARD_DEFAULT_WIDTH, height: PROMPT_CARD_DEFAULT_HEIGHT };
    const previousSize = sizeRef.current;
    applySize(defaultSize);
    const saveResult = onResize?.(defaultSize);
    if (saveResult instanceof Promise) {
      void saveResult.then((saved) => {
        if (!saved) applySize(previousSize);
      });
    } else if (saveResult === false) {
      applySize(previousSize);
    }
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = sizeRef.current;
    let nextSize = startSize;
    const resizeState = { startSize, nextSize };
    resizeStateRef.current = resizeState;
    const flushFrame = () => {
      resizeFrameRef.current = null;
      const state = resizeStateRef.current;
      if (!state) return;
      applySize(state.nextSize);
    };
    const handleMove = (moveEvent: PointerEvent) => {
      nextSize = {
        width: clampPromptCardWidth(startSize.width + moveEvent.clientX - startX),
        height: clampPromptCardHeight(startSize.height + moveEvent.clientY - startY),
      };
      resizeState.nextSize = nextSize;
      if (resizeFrameRef.current === null) resizeFrameRef.current = window.requestAnimationFrame(flushFrame);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      const finalSize = resizeState.nextSize;
      resizeStateRef.current = null;
      applySize(finalSize);
      if (finalSize.width !== startSize.width || finalSize.height !== startSize.height) {
        const saveResult = onResize?.(finalSize);
        if (saveResult instanceof Promise) void saveResult.then((saved) => { if (!saved) applySize(startSize); });
        else if (saveResult === false) applySize(startSize);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  return (
    <article className={`group relative grid min-h-0 max-w-full grid-rows-[48px_minmax(0,1fr)_56px_52px] overflow-hidden rounded-xl border bg-panel shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${tone.article} ${selected ? "ring-2 ring-primary/35" : ""}`} style={{ width: `${size.width}px`, height: `${size.height}px` }}>
      <div className={`flex min-w-0 items-center gap-2 border-b px-4 py-2 ${tone.header}`}>
        <button aria-label={selected ? t("取消选择") : t("选择灵感")} className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted"}`} type="button" onClick={onSelect}>
          {selected ? <Check size={15} /> : <span className="size-3 rounded-sm border border-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">{entry.title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {dragHandleProps ? <button {...dragHandleProps} aria-label={t("拖动灵感")} className="flex size-7 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-panel/80 active:cursor-grabbing" type="button"><GripVertical size={15} /></button> : null}
          <button aria-label={entry.favorite ? t("取消收藏") : t("收藏")} className={`flex size-7 items-center justify-center rounded-lg hover:bg-primary-soft ${entry.favorite ? "text-warning" : "text-muted"}`} type="button" onClick={onToggleFavorite}><Star fill={entry.favorite ? "currentColor" : "none"} size={16} /></button>
        </div>
      </div>

      {isGithubProject && entry.github ? (
        <div
          className="h-full min-h-0 overflow-y-auto p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button,a")) return;
            if (selectionMode) onSelect(); else onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if ((event.target as HTMLElement).closest("button,a")) return;
            event.preventDefault();
            if (selectionMode) onSelect(); else onOpen();
          }}
        >
          <div className="mb-3 grid gap-1"><p className="truncate text-xs font-medium text-primary">{entry.github.fullName}</p>{safeDescription ? <p className="line-clamp-2 text-xs leading-5 text-muted">{safeDescription}</p> : null}</div>
          <GithubProjectContent project={entry.github} compact showReleases={false} onToggleReadme={onGithubReadmeCollapsed} />
        </div>
      ) : (
        <div
          aria-label={t("打开灵感")}
          className="h-full min-h-0 overflow-y-auto p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35"
          role="button"
          tabIndex={0}
          onClick={(event) => handleCardContentClick(event, selectionMode, onSelect, onOpen)}
          onKeyDown={(event) => handleCardContentKeyDown(event, selectionMode, onSelect, onOpen)}
        >
          <p className="h-10 overflow-hidden text-sm leading-5 text-muted">{safeDescription}</p>
          {richContentHtml ? <PromptCardRichContent className="min-h-[60px]" html={richContentHtml} /> : <p className="min-h-[60px] whitespace-pre-wrap break-words text-[13px] leading-5 text-muted">{safeContent}</p>}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-wrap content-start items-start gap-1.5 overflow-y-auto px-4 py-1">
        {category ? <span className={`max-w-full shrink-0 whitespace-normal break-words rounded-full border px-2 py-0.5 text-[11px] leading-4 ${tone.tag}`}>{category.icon} {category.name}</span> : null}
        {[...entry.tagIds].sort(compareTagLength).slice(0, 3).map((tag) => <span className={`max-w-24 shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] ${tone.tag}`} key={tag}>{tag}</span>)}
        {entry.tagIds.length > 3 ? <span className="shrink-0 px-1 py-0.5 text-[11px] text-muted">+{entry.tagIds.length - 3}</span> : null}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2 pr-11 text-xs text-muted">
        <span className="min-w-0 truncate">{entry.usageCount} {t("次使用")}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button aria-label={isGithubProject ? t("复制") : t("复制灵感")} className={`flex size-8 items-center justify-center rounded-lg border bg-panel/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`} title={isGithubProject ? t("复制") : t("复制灵感")} type="button" onClick={onCopy}><Copy size={14} /></button>
          {onAddToTodo ? <button aria-label={t("添加到待办")} className={`flex size-8 items-center justify-center rounded-lg border bg-panel/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`} title={t("添加到待办")} type="button" onClick={onAddToTodo}><ListPlus size={14} /></button> : null}
          <button aria-label={t("编辑")} className={`flex size-8 items-center justify-center rounded-lg border bg-panel/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`} title={t("编辑")} type="button" onClick={onEdit}><Pencil size={14} /></button>
          <button aria-label={t("删除")} className={`flex size-8 items-center justify-center rounded-lg border bg-panel/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`} title={t("删除")} type="button" onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>
      <button aria-label={t("调整卡片大小，双击恢复默认")} className="absolute bottom-1 right-1 flex size-7 cursor-nwse-resize items-center justify-center rounded-md text-muted/70 opacity-0 transition-opacity hover:bg-primary-soft hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" title={t("拖动调整大小，双击恢复默认")} type="button" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); resetSize(); }} onPointerDown={startResize}><Maximize2 size={14} /></button>
    </article>
  );
}

function compareTagLength(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right, "zh-CN");
}

function handleCardContentClick(
  event: ReactMouseEvent<HTMLDivElement>,
  selectionMode: boolean,
  onSelect: () => void,
  onOpen: () => void,
): void {
  if ((event.target as HTMLElement).closest("button,a")) return;
  if (selectionMode) onSelect(); else onOpen();
}

function handleCardContentKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  selectionMode: boolean,
  onSelect: () => void,
  onOpen: () => void,
): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  if ((event.target as HTMLElement).closest("button,a")) return;
  event.preventDefault();
  if (selectionMode) onSelect(); else onOpen();
}
