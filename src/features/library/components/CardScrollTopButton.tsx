import { ArrowUp } from "lucide-react";
import type { CSSProperties } from "react";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";

type CardScrollTopButtonProps = {
  className?: string;
  contentMaxWidth?: number;
  style?: CSSProperties;
  onClick: () => void;
};

export function CardScrollTopButton({ className = "", contentMaxWidth, style, onClick }: CardScrollTopButtonProps) {
  const { t } = useLocale();
  const anchoredStyle: CSSProperties | undefined =
    contentMaxWidth == null
      ? style
      : {
          // 悬浮窗口在视口四周留了一圈 gutter（见 tokens.css），fixed 元素按视口定位，
          // 兜底间距要加上 gutter 才不会贴到圆角外壳的边上。
          right: `max(calc(1.5rem + var(--app-window-gutter)), calc((100vw - var(--library-sidebar-width, 0px) - ${contentMaxWidth}px) / 2 - 3rem))`,
          ...style,
        };

  return (
    <IconTooltipButton
      ariaLabel={t("回到顶部")}
      className={className}
      icon={<ArrowUp size={15} />}
      label={t("回到顶部")}
      size="sm"
      style={anchoredStyle}
      variant="subtle"
      onClick={onClick}
    />
  );
}
