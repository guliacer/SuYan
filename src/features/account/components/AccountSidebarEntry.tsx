import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { AccountIcon } from "../../../components/ui/AccountIcon";
import { useLocale } from "@/components/LocaleProvider";
import { useAccountStore } from "../store/useAccountStore";
import { UserAvatar } from "./UserAvatar";
import { LoginDialog } from "./LoginDialog";
import { AccountDialog } from "./AccountDialog";
import { RegisterDialog } from "./RegisterDialog";

/**
 * 侧边栏底部账号入口（方案 §十三）：
 * - 未登录：显示「账户」按钮，打开 LoginDialog（可切换到注册/登录）；
 * - 已登录：显示头像 + 用户名，点击打开独立账号管理弹窗；
 * - initializing：显示占位，避免启动瞬间闪烁「未登录」。
 */
export function AccountSidebarEntry({ isCompact = false }: { isCompact?: boolean }) {
  const { t } = useLocale();
  const status = useAccountStore((state) => state.status);
  const user = useAccountStore((state) => state.user);
  const oauthConfirmation = useAccountStore((state) => state.oauthConfirmation);
  const clearError = useAccountStore((state) => state.clearError);
  const setDialogOpen = useAccountStore((state) => state.setDialogOpen);
  const [dialog, setDialog] = useState<"login" | "register" | "account" | null>(null);
  const [forceReauthentication, setForceReauthentication] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");

  function closeDialog(): void {
    clearError();
    setDialog(null);
    setForceReauthentication(false);
  }

  useEffect(() => {
    setDialogOpen(dialog !== null);
    return () => setDialogOpen(false);
  }, [dialog, setDialogOpen]);
  // 登录态变化时关闭打开的弹窗/菜单。
  useEffect(() => {
    if (status === "authenticated" && !oauthConfirmation) {
      setDialog((current) => (current === "account" ? current : null));
      setForceReauthentication(false);
    }
  }, [oauthConfirmation, status]);

  if (status === "initializing") {
    return (
      <div className={`flex min-h-11 items-center gap-3 rounded-xl border border-transparent text-chrome-muted ${isCompact ? "justify-center px-0" : "justify-start px-3"}`}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl border border-chrome-border/70 bg-chrome-control/55">
          <div className="size-4 animate-pulse rounded-full bg-chrome-foreground/30" />
        </span>
        {!isCompact ? <span className="truncate text-sm text-chrome-muted">{t("账户加载中...")}</span> : null}
      </div>
    );
  }

  if (status === "authenticated" && user) {
    return (
      <>
        <button
          aria-expanded={dialog === "account"}
          aria-haspopup="dialog"
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
            isCompact ? "justify-center px-0" : "justify-start px-3"
          } border-transparent text-chrome-muted hover:border-chrome-border hover:bg-chrome-control/55 hover:text-chrome-foreground`}
          type="button"
          onClick={() => setDialog(oauthConfirmation ? "login" : "account")}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl border border-chrome-border/70 bg-chrome-control/55">
            <UserAvatar size={24} user={user} />
          </span>
          {!isCompact ? (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{user.username}</span>
              <ChevronDown className="shrink-0 text-chrome-muted" size={14} />
            </>
          ) : null}
        </button>
        {dialog === "account"
          ? renderDialog(
              <AccountDialog
                onClose={closeDialog}
                onSwitchAccount={() => {
                  setForceReauthentication(true);
                  setDialog("login");
                }}
              />,
            )
          : null}
        {dialog === "login"
          ? renderDialog(
              <LoginDialog
                forceReauthentication={forceReauthentication}
                initialEmail={loginEmail}
                onClose={closeDialog}
                onSwitchToRegister={() => setDialog("register")}
              />,
            )
          : null}
      </>
    );
  }

  return (
    <>
      <button
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
          isCompact ? "justify-center px-0" : "justify-start px-3"
        } border-transparent text-chrome-muted hover:border-chrome-border hover:bg-chrome-control/55 hover:text-chrome-foreground`}
        type="button"
        onClick={() => setDialog("login")}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl border border-chrome-border/70 bg-chrome-control/55">
          <AccountIcon className="size-4" />
        </span>
        {!isCompact ? t("账户") : null}
      </button>

      {dialog === "login"
        ? renderDialog(
            <LoginDialog
              forceReauthentication={forceReauthentication}
              initialEmail={loginEmail}
              onClose={closeDialog}
              onSwitchToRegister={() => setDialog("register")}
            />,
          )
        : null}
      {dialog === "register"
        ? renderDialog(
            <RegisterDialog
              onClose={closeDialog}
              onSwitchToLogin={(email) => {
                setLoginEmail(email ?? "");
                setDialog("login");
              }}
            />,
          )
        : null}
    </>
  );
}

function renderDialog(dialog: ReactNode): ReactNode {
  // 侧栏的 backdrop-filter 会改变 fixed 定位上下文；Portal 让弹窗回到整个应用窗口。
  if (typeof document === "undefined" || !document.body) {
    return dialog;
  }
  return createPortal(dialog, document.body);
}
