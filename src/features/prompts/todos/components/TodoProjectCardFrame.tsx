import { useEffect, useState, type DragEventHandler, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import type { TodoProject } from "../../types";
import { getTodoProjectColor } from "../utils/todoProgress";
import { clampTodoCardHeight, clampTodoCardWidth, TODO_CARD_DEFAULT_HEIGHT, TODO_CARD_DEFAULT_WIDTH } from "../utils/todoCardSizing";

type Props = {
  project: TodoProject | null;
  projectIndex: number;
  children: ReactNode;
  onResize?: (size: { width?: number; height: number }) => void | Promise<unknown>;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
};

export function TodoProjectCardFrame({ project, projectIndex, children, onResize, draggable, onDragStart, onDragOver, onDrop }: Props) {
  const { t } = useLocale();
  const [size, setSize] = useState(() => ({
    width: clampTodoCardWidth(project?.cardWidth ?? TODO_CARD_DEFAULT_WIDTH),
    height: clampTodoCardHeight(project?.cardHeight ?? TODO_CARD_DEFAULT_HEIGHT),
  }));
  const [widthAdjusted, setWidthAdjusted] = useState(() => Boolean(project?.cardWidth));
  const tone = CAPSULE_TONES[getTodoProjectColor(project?.id ?? "unassigned", project?.colorId, projectIndex)];

  useEffect(() => {
    setSize({
      width: clampTodoCardWidth(project?.cardWidth ?? TODO_CARD_DEFAULT_WIDTH),
      height: clampTodoCardHeight(project?.cardHeight ?? TODO_CARD_DEFAULT_HEIGHT),
    });
    setWidthAdjusted(Boolean(project?.cardWidth));
  }, [project?.cardHeight, project?.cardWidth, project?.id]);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const frame = event.currentTarget.parentElement;
    const initialSize = size;
    const displayedWidth = clampTodoCardWidth(frame?.getBoundingClientRect().width ?? size.width);
    const resizeBaseWidth = widthAdjusted ? initialSize.width : displayedWidth;
    let nextSize = { width: resizeBaseWidth, height: initialSize.height };
    const startWidthAdjusted = widthAdjusted;
    const handleMove = (moveEvent: PointerEvent) => {
      nextSize = {
        width: clampTodoCardWidth(resizeBaseWidth + moveEvent.clientX - startX),
        height: clampTodoCardHeight(initialSize.height + moveEvent.clientY - startY),
      };
      setWidthAdjusted(startWidthAdjusted || nextSize.width !== resizeBaseWidth);
      setSize(nextSize);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const widthChanged = nextSize.width !== resizeBaseWidth;
      const heightChanged = nextSize.height !== initialSize.height;
      if (!widthChanged && !heightChanged) return;
      const saveResult = onResize?.({
        ...(startWidthAdjusted || widthChanged ? { width: nextSize.width } : {}),
        height: nextSize.height,
      });
      if (saveResult instanceof Promise) void saveResult.then((saved) => {
        if (!saved) {
          setSize(initialSize);
          setWidthAdjusted(startWidthAdjusted);
        }
      });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  return <article
    className={`group relative flex min-h-0 w-full min-w-0 max-w-full flex-col justify-self-center overflow-hidden rounded-xl border bg-panel shadow-sm ${tone.borderHover}`}
    draggable={draggable}
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    style={{ ...(widthAdjusted ? { width: `min(100%, ${size.width}px)` } : {}), height: `${size.height}px` }}
  >
    {children}
    {onResize ? <button aria-label={t("调整项目卡片大小")} className="absolute bottom-1 right-1 z-10 flex size-7 cursor-nwse-resize items-center justify-center rounded-md bg-panel/75 text-muted/75 opacity-0 transition-opacity hover:bg-primary-soft hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" title={t("调整项目卡片大小")} type="button" onClick={(event) => event.stopPropagation()} onPointerDown={startResize}><Maximize2 size={14} /></button> : null}
  </article>;
}
