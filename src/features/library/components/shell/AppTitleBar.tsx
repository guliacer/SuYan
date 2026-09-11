import { useEffect, useState, type ReactNode } from "react";
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Pin, Square, X } from "lucide-react";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { useLocale } from "@/components/LocaleProvider";

type SidebarToggleButtonProps = {
  isOpen: boolean;
  onClick: () => void;
};

type AppTitleBarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function AppTitleBar({ isSidebarOpen, onToggleSidebar }: AppTitleBarProps) {
  const { t } = useLocale();
  const [isMaximized, setIsMaximized] = useState(true);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    window.suyanApi.isWindowMaximized().then((result) => {
      if (result.ok && result.data) {
        setIsMaximized(result.data.maximized);
      }
    });
    unsubscribe = window.suyanApi.onWindowMaximizeChange((maximized) => {
      setIsMaximized(maximized);
    });
    void window.suyanApi.isWindowAlwaysOnTop().then((result) => {
      if (result.ok && result.data) {
        setIsAlwaysOnTop(result.data.alwaysOnTop);
      }
    });
    return () => unsubscribe();
  }, []);

  async function toggleAlwaysOnTop() {
    const result = await window.suyanApi.toggleAlwaysOnTopWindow();
    if (result.ok && result.data) {
      setIsAlwaysOnTop(result.data.alwaysOnTop);
    }
  }

  return (
    <header
      className="app-titlebar app-chrome-surface relative z-[10000] flex h-11 shrink-0 items-center justify-between border-b pl-3 pr-2 [-webkit-app-region:drag]"
      data-app-titlebar="true"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarToggleButton isOpen={isSidebarOpen} onClick={onToggleSidebar} />
        <AppLogoMark />
        <span className="truncate text-sm font-semibold text-chrome-foreground">{t("素言")}</span>
      </div>
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <WindowControlButton
          ariaLabel={t("最小化")}
          icon={<Minus size={15} />}
          onClick={() => void window.suyanApi.minimizeWindow()}
        />
        <WindowControlButton
          active={isAlwaysOnTop}
          ariaLabel={isAlwaysOnTop ? t("取消置顶") : t("置顶")}
          dataFeatureGuide="window-always-on-top"
          icon={<Pin size={14} />}
          onClick={() => void toggleAlwaysOnTop()}
        />
        <WindowControlButton
          ariaLabel={isMaximized ? t("向下还原") : t("最大化")}
          icon={isMaximized ? <Copy size={12} /> : <Square size={12} />}
          onClick={() => void window.suyanApi.toggleMaximizeWindow()}
        />
        <WindowControlButton
          ariaLabel={t("关闭")}
          icon={<X size={15} />}
          variant="close"
          onClick={() => void window.suyanApi.closeWindow()}
        />
      </div>
    </header>
  );
}

type WindowControlButtonProps = {
  ariaLabel: string;
  icon: ReactNode;
  active?: boolean;
  dataFeatureGuide?: string;
  variant?: "default" | "close";
  onClick: () => void;
};

function WindowControlButton({
  active = false,
  ariaLabel,
  dataFeatureGuide,
  icon,
  variant = "default",
  onClick,
}: WindowControlButtonProps) {
  const hoverClassName = variant === "close"
    ? "hover:bg-danger-strong hover:text-danger-foreground"
    : "hover:bg-chrome-control/70 hover:text-chrome-foreground";

  return (
    <button
      aria-label={ariaLabel}
      data-feature-guide={dataFeatureGuide}
      className={`flex size-8 shrink-0 items-center justify-center rounded-xl border border-transparent outline-none shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 [-webkit-app-region:no-drag] ${active ? "bg-primary-soft text-foreground" : "bg-transparent text-chrome-muted"} ${hoverClassName}`}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function SidebarToggleButton({ isOpen, onClick }: SidebarToggleButtonProps) {
  const { t } = useLocale();
  const label = isOpen ? t("隐藏边栏") : t("显示边栏");

  return (
    <button
      aria-label={label}
      data-feature-guide="sidebar-toggle"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-chrome-foreground outline-none shadow-none [-webkit-app-region:no-drag] transition-colors hover:bg-chrome-control/40 hover:text-chrome-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
      title={label}
      type="button"
      onClick={onClick}
    >
      {isOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
    </button>
  );
}
