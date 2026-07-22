import { ArrowUp } from "lucide-react";
import type { CSSProperties } from "react";

type CardScrollTopButtonProps = {
  className?: string;
  contentMaxWidth?: number;
  style?: CSSProperties;
  onClick: () => void;
};

export function CardScrollTopButton({ className = "", contentMaxWidth, style, onClick }: CardScrollTopButtonProps) {
  const anchoredStyle: CSSProperties | undefined =
    contentMaxWidth == null
      ? style
      : {
          right: `max(1.5rem, calc((100vw - var(--library-sidebar-width, 0px) - ${contentMaxWidth}px) / 2 - 3rem))`,
          ...style,
        };

  return (
    <button
      aria-label="回到顶部"
      className={`group flex size-8 items-center justify-center rounded-full border border-border/70 bg-panel/95 text-muted shadow-sm backdrop-blur outline-none transition-all hover:-translate-y-0.5 hover:bg-primary-soft hover:text-foreground hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/25 ${className}`}
      style={anchoredStyle}
      title="回到顶部"
      type="button"
      onClick={onClick}
    >
      <span className="relative flex size-full items-center justify-center">
        <ArrowUp size={15} />
        <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 -translate-x-1/2 translate-y-0.5 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground opacity-0 shadow-elevated transition-all group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:-translate-y-0.5 group-focus-visible:opacity-100" role="tooltip">
          回到顶部
        </span>
      </span>
    </button>
  );
}
