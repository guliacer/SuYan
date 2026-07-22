import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

type IconTooltipButtonVariant = "subtle" | "panel" | "primary" | "progress" | "danger" | "ghost";
type IconTooltipButtonSize = "sm" | "md" | "lg";
type TooltipPlacement = "above" | "below" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

type IconTooltipButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  active?: boolean;
  ariaLabel?: string;
  icon: ReactNode;
  label: string;
  pressed?: boolean;
  size?: IconTooltipButtonSize;
  tooltipAlign?: TooltipAlign;
  tooltipPlacement?: TooltipPlacement;
  variant?: IconTooltipButtonVariant;
};

const variants: Record<IconTooltipButtonVariant, string> = {
  subtle: "border-border bg-panel/45 text-muted/70 hover:bg-panel/85 hover:text-foreground",
  panel: "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground",
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  progress: "border-progress bg-progress text-primary-foreground hover:bg-progress/90",
  danger: "border-border bg-panel/45 text-muted/70 hover:bg-danger-soft hover:text-danger",
  ghost: "border-transparent bg-transparent text-muted hover:bg-panel hover:text-foreground",
};

const activeVariants: Record<IconTooltipButtonVariant, string> = {
  subtle: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  panel: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  progress: "border-progress bg-progress text-primary-foreground hover:bg-progress/90",
  danger: "border-danger bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger",
  ghost: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
};

const sizes: Record<IconTooltipButtonSize, string> = {
  sm: "size-8",
  md: "size-9",
  lg: "size-12",
};

type TooltipStyle = {
  top: number;
  left: number;
  transform: string;
};

const tooltipGap = 8;
const viewportPadding = 8;

function computeTooltipStyle(
  buttonRect: DOMRect,
  placement: TooltipPlacement,
  align: TooltipAlign,
): TooltipStyle {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let actualPlacement = placement;
  if (placement === "above" && buttonRect.top - tooltipGap < viewportPadding) {
    actualPlacement = "below";
  } else if (placement === "below" && buttonRect.bottom + tooltipGap > viewportHeight - viewportPadding) {
    actualPlacement = "above";
  }

  let top: number;
  let translateY: string;

  if (actualPlacement === "above") {
    top = buttonRect.top - tooltipGap;
    translateY = "translateY(-100%)";
  } else if (actualPlacement === "below") {
    top = buttonRect.bottom + tooltipGap;
    translateY = "translateY(0)";
  } else {
    top = buttonRect.top + buttonRect.height / 2;
    translateY = "translateY(-50%)";
  }

  let left: number;
  let translateX: string;

  if (actualPlacement === "left") {
    left = buttonRect.left - tooltipGap;
    translateX = "translateX(-100%)";
  } else if (actualPlacement === "right") {
    left = buttonRect.right + tooltipGap;
    translateX = "translateX(0)";
  } else if (align === "start") {
    left = buttonRect.left;
    translateX = "translateX(0)";
  } else if (align === "end") {
    left = buttonRect.right;
    translateX = "translateX(-100%)";
  } else {
    left = buttonRect.left + buttonRect.width / 2;
    translateX = "translateX(-50%)";
  }

  const transform = `${translateX} ${translateY}`.trim();

  return { top, left, transform };
}

export function IconTooltipButton({
  active = false,
  ariaLabel,
  className = "",
  disabled = false,
  icon,
  label,
  pressed,
  size = "md",
  title: _title,
  tooltipAlign = "center",
  tooltipPlacement = "below",
  type = "button",
  variant = "panel",
  ...props
}: IconTooltipButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<TooltipStyle | null>(null);

  const updateStyle = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    setStyle(computeTooltipStyle(buttonRect, tooltipPlacement, tooltipAlign));
  }, [tooltipAlign, tooltipPlacement]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    updateStyle();
  }, [isOpen, updateStyle]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleScroll = () => updateStyle();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen, updateStyle]);

  return (
    <button
      ref={buttonRef}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      className={`icon-tooltip-button inline-flex shrink-0 items-center justify-center rounded-xl border text-sm font-medium outline-none shadow-elevated transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-40 ${
        sizes[size]
      } ${active ? activeVariants[variant] : variants[variant]} ${className}`}
      disabled={disabled}
      type={type}
      onBlur={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onMouseEnter={() => setIsOpen(true)}
      {...props}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      {isOpen && style
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: "fixed",
                top: `${style.top}px`,
                left: `${style.left}px`,
                transform: style.transform,
                zIndex: 9999,
              }}
              className="icon-tooltip-button__bubble icon-tooltip-button__bubble--portal"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}
