import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Link2,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "../store/useAccountStore";
import { UserAvatar } from "./UserAvatar";
import { OAuthProfileChoiceFields } from "./OAuthProfileChoiceFields";
import { AccountErrorBanner } from "./accountErrorBanner";
import {
  ACCOUNT_EXTERNAL_PROVIDER_IDS,
  ACCOUNT_IDENTITY_PROVIDER_LABELS,
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  type AccountExternalProviderId,
  type AccountIdentity,
  type AccountLoginProviderId,
  type AccountOAuthProfileSelection,
  type AccountProviderId,
  type AccountUser,
} from "../types/account";

const LEGACY_PROVIDER_LABELS: Record<AccountProviderId, string> = {
  email: "邮箱账号",
  guli: "Guli Identity",
};

type AccountDialogProps = {
  onClose: () => void;
  onSwitchAccount: () => void;
};

/** 已登录账号的独立管理弹窗：资料和多身份关系都以身份服务返回值为准。 */
export function AccountDialog({ onClose, onSwitchAccount }: AccountDialogProps) {
  const { t, language } = useLocale();
  const user = useAccountStore((state) => state.user);
  const provider = useAccountStore((state) => state.provider);
  const loginProvider = useAccountStore((state) => state.loginProvider);
  const oauthPendingProvider = useAccountStore((state) => state.oauthPendingProvider);
  const oauthPurpose = useAccountStore((state) => state.oauthPurpose);
  const oauthConfirmation = useAccountStore((state) => state.oauthConfirmation);
  const logout = useAccountStore((state) => state.logout);
  const linkOAuth = useAccountStore((state) => state.linkOAuth);
  const confirmOAuth = useAccountStore((state) => state.confirmOAuth);
  const cancelOAuth = useAccountStore((state) => state.cancelOAuth);
  const refreshAccount = useAccountStore((state) => state.refreshAccount);
  const updateProfile = useAccountStore((state) => state.updateProfile);
  const chooseAvatar = useAccountStore((state) => state.chooseAvatar);
  const removeAvatar = useAccountStore((state) => state.removeAvatar);
  const selectOAuthAvatar = useAccountStore((state) => state.selectOAuthAvatar);
  const unlinkIdentity = useAccountStore((state) => state.unlinkIdentity);
  const isSubmitting = useAccountStore((state) => state.isSubmitting);
  const submittingAction = useAccountStore((state) => state.submittingAction);
  const activeOAuthProvider = useAccountStore((state) => state.activeOAuthProvider);
  const [pendingUnlink, setPendingUnlink] = useState<AccountExternalProviderId | null>(null);
  const [profileDraft, setProfileDraft] = useState(user?.username ?? "");
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  const [profileSelection, setProfileSelection] = useState<AccountOAuthProfileSelection>({
    usernameSource: "current",
    avatarSource: "current",
  });
  const isLinkFlow = oauthPurpose === "link";
  const linkConfirmation = isLinkFlow ? oauthConfirmation : null;

  useEffect(() => {
    if (user) {
      setProfileDraft(user.username);
    }
  }, [user?.uid, user?.username]);

  useEffect(() => {
    if (linkConfirmation) {
      setProfileSelection({ usernameSource: "current", avatarSource: "current" });
      setCustomAvatarPreview(null);
    }
  }, [linkConfirmation?.expiresAt, linkConfirmation?.loginProvider]);

  async function handleChooseCustomAvatar(): Promise<boolean> {
    const previewUrl = await selectOAuthAvatar();
    if (!previewUrl) {
      return false;
    }
    setCustomAvatarPreview(previewUrl);
    return true;
  }

  if (!user) {
    return null;
  }

  const identities = getVisibleIdentities(user, loginProvider, provider);
  const linkedProviders = new Set(identities.map((identity) => identity.provider));
  const availableProviders = ACCOUNT_EXTERNAL_PROVIDER_IDS.filter(
    (identityProvider) => !linkedProviders.has(identityProvider),
  );
  async function handleLogout() {
    await logout();
    if (!useAccountStore.getState().error) {
      onClose();
    }
  }

  async function handleUnlink() {
    if (!pendingUnlink) {
      return;
    }
    const target = pendingUnlink;
    await unlinkIdentity(target);
    if (!useAccountStore.getState().error) {
      setPendingUnlink(null);
    }
  }

  return (
    <>
      <AppDialog
        panelClassName="flex max-h-[min(760px,calc(100vh-1rem))] min-h-0 w-full max-w-lg flex-col"
        titleId="account-dialog-title"
        onClose={onClose}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium text-muted">{t("账号中心")}</p>
            <h2
              className="mt-1 text-base font-semibold text-foreground"
              id="account-dialog-title"
            >
              {t("我的账号")}
            </h2>
          </div>
          <DialogCloseButton ariaLabel={`${t("关闭")} ${t("账户")}`} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4">
            <UserAvatar size={52} user={user} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {user.username}
              </p>
              <p className="mt-1 truncate text-xs text-muted">
                {accountSubtitle(user, loginProvider, provider, t)}
              </p>
            </div>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
              <ShieldCheck size={13} />
              {t("已登录")}
            </span>
          </div>

          <section
            data-feature-guide="account-profile"
            className="grid gap-2 rounded-2xl border border-border px-4 py-3"
            aria-label={t("账号资料")}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted">{t("账号资料")}</p>
              <Button
                className="min-h-8 shrink-0 px-2.5 py-1.5 text-xs"
                disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                icon={<RefreshCw size={13} />}
                size="sm"
                title={t("从 Guli Identity 刷新昵称、头像和绑定方式")}
                onClick={() => void refreshAccount()}
              >
                {t("刷新资料")}
              </Button>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background px-3 py-3">
              <UserAvatar size={44} user={user} />
              <div className="min-w-0 flex-1">
                <label className="grid gap-1.5 text-[11px] font-medium text-muted" htmlFor="account-profile-display-name">
                  {t("自定义昵称")}
                  <TextField
                    autoComplete="nickname"
                    disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                    id="account-profile-display-name"
                    maxLength={64}
                    placeholder={t("输入你希望显示的昵称")}
                    value={profileDraft}
                    onChange={(event) => setProfileDraft(event.target.value)}
                  />
                </label>
              </div>
              <Button
                aria-label={t("保存昵称")}
                className="size-9 shrink-0 px-0"
                disabled={
                  isSubmitting ||
                  Boolean(oauthPendingProvider) ||
                  Boolean(oauthConfirmation) ||
                  !profileDraft.trim() ||
                  profileDraft.trim() === user.username
                }
                icon={<Save size={14} />}
                title={t("保存昵称")}
                onClick={() => void updateProfile({ displayName: profileDraft })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                icon={<ImagePlus size={13} />}
                size="sm"
                title={t("选择自定义头像")}
                onClick={() => void chooseAvatar()}
              >
                {t("自定义头像")}
              </Button>
              {user.avatarUrl ? (
                <Button
                  className="min-h-8 px-2.5 py-1.5 text-xs"
                  disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                  size="sm"
                  variant="ghost"
                  onClick={() => void removeAvatar()}
                >
                  {t("使用默认头像")}
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] leading-5 text-muted">
              {t("可在登录确认时选择当前资料、新登录资料或自定义资料；登录后也可以随时修改昵称和头像。")}
            </p>
            {user.email ? <InfoRow label={t("邮箱")} value={user.email} /> : null}
            <InfoRow label={t("用户 ID")} value={user.uid} mono />
            {user.createdAt ? (
              <InfoRow label={t("注册时间")} value={formatDate(user.createdAt, language)} />
            ) : null}
            <p className="pt-1 text-[11px] leading-5 text-muted">
              {t("昵称和头像由 Guli Identity 统一维护；刷新后会同步到本机账号和导出作者信息。")}
            </p>
          </section>

          <section
            data-feature-guide="account-identities"
            className="grid gap-3 rounded-2xl border border-border px-4 py-3"
            aria-label={t("已绑定账号")}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted">{t("已绑定登录方式")}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {t("可关联 Google、Linux.do 和 GitHub。已验证的邮箱账号也会显示在这里；关联后可登录同一账号。")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">
                {t("{count} 种", { count: identities.length })}
              </span>
            </div>

            <div className="grid gap-2">
              {identities.map((identity) => (
                <IdentityRow
                  identity={identity}
                  disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                  isCurrent={isCurrentIdentity(identity, loginProvider, provider)}
                  key={`${identity.provider}:${identity.issuer ?? ""}:${identity.providerUserId}`}
                  onUnlink={
                    identity.provider === "email" || identity.provider === "guli"
                      ? undefined
                      : () => setPendingUnlink(identity.provider as AccountExternalProviderId)
                  }
                />
              ))}
            </div>

            {availableProviders.length > 0 ? (
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <p className="text-xs font-medium text-muted">{t("关联新的登录方式")}</p>
                <div className="grid gap-2 min-[420px]:grid-cols-2">
                  {availableProviders.map((identityProvider) => (
                    <Button
                      className="min-h-9 w-full px-2 text-xs"
                      maxWidth={false}
                      disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
                      icon={
                        oauthPendingProvider === identityProvider || (submittingAction === "linkOAuth" && activeOAuthProvider === identityProvider) ? (
                          <RefreshCw className="animate-spin" size={13} />
                        ) : (
                          <Link2 size={13} />
                        )
                      }
                      key={identityProvider}
                      title={`${t("关联登录方式")} ${identityLabel(identityProvider, t)}`}
                      onClick={() => void linkOAuth(identityProvider, { prompt: "login" })}
                    >
                      {submittingAction === "linkOAuth" && activeOAuthProvider === identityProvider
                        ? t("正在打开授权页...")
                        : oauthPendingProvider === identityProvider
                        ? t("等待关联确认...")
                        : identityLabel(identityProvider, t)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {isLinkFlow && oauthPendingProvider ? (
              <div
                className="grid gap-2 rounded-xl border border-primary/25 bg-primary-soft p-3 text-xs leading-5"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  <ExternalLink className="mt-0.5 shrink-0 text-primary" size={15} />
                  <p className="text-muted">
                    {t("已在系统默认浏览器打开 {provider} 授权页。在浏览器确认绑定后，登录方式会自动更新；原昵称和头像会保留。取消等待不会撤销浏览器中已确认的绑定。", { provider: identityLabel(oauthPendingProvider, t) })}
                  </p>
                </div>
                <Button
                  className="w-full border-primary/25 bg-panel/70 text-primary hover:border-primary/45"
                  disabled={isSubmitting}
                  icon={<X size={13} />}
                  maxWidth={false}
                  size="sm"
                  variant="ghost"
                  onClick={() => void cancelOAuth()}
                >
                  {submittingAction === "cancelOAuth" ? t("正在停止等待...") : t("停止等待")}
                </Button>
              </div>
            ) : null}

            {linkConfirmation ? (
              <div
                className="grid gap-3 rounded-xl border border-primary/30 bg-primary-soft p-3 text-xs leading-5"
                role="alert"
                aria-live="assertive"
              >
                <div className="flex items-start gap-2.5">
                  <UserAvatar size={38} user={linkConfirmation.user} />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{t("确认绑定该方式？")}</p>
                    <p className="mt-0.5 break-words text-muted">
                      {identityLabel(linkConfirmation.loginProvider, t)}
                      {linkConfirmation.user.email ? ` · ${linkConfirmation.user.email}` : ""}
                    </p>
                    <p className="mt-1 text-muted">{t("确认后会加入当前账号，不会切换当前账号。")}</p>
                  </div>
                </div>
                <OAuthProfileChoiceFields
                  currentUser={user}
                  customAvatarPreview={customAvatarPreview}
                  disabled={isSubmitting}
                  pendingUser={linkConfirmation.user}
                  selection={profileSelection}
                  onChange={setProfileSelection}
                  onChooseCustomAvatar={handleChooseCustomAvatar}
                />
                <div className="grid gap-2 min-[420px]:grid-cols-2">
                  <Button
                    className="w-full"
                    disabled={isSubmitting}
                    icon={<CheckCircle2 size={14} />}
                    maxWidth={false}
                    onClick={() => void confirmOAuth(profileSelection)}
                  >
                    {submittingAction === "confirmOAuth" ? t("确认中...") : t("确认绑定")}
                  </Button>
                  <Button
                    className="w-full"
                    disabled={isSubmitting}
                    icon={<X size={14} />}
                    maxWidth={false}
                    variant="ghost"
                    onClick={() => void cancelOAuth()}
                  >
                    {t("取消")}
                  </Button>
                </div>
              </div>
            ) : null}

            {identities.length <= 1 ? (
              <p className="text-[11px] leading-5 text-muted">
                {t("至少保留一种登录方式。绑定另一种方式后，才可以解绑当前的第三方方式。")}
              </p>
            ) : null}
          </section>

          <AccountErrorBanner />

          <div className="grid gap-2 min-[420px]:grid-cols-2">
            <Button
              className="min-h-10 w-full"
              disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
              icon={<RefreshCw size={16} />}
              title={t("切换账号")}
              onClick={onSwitchAccount}
            >
              {t("切换账号")}
            </Button>
            <Button
              className="min-h-10 w-full"
              disabled={isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation)}
              icon={<LogOut size={16} />}
              variant="danger"
              onClick={() => void handleLogout()}
            >
              {submittingAction === "logout" ? t("正在退出...") : t("退出登录")}
            </Button>
          </div>
          </div>
        </div>
      </AppDialog>

      <ConfirmDialog
        description={t("解绑 {provider} 后，该方式将不能再登录当前账号；本地不会自动合并其它账号。", { provider: pendingUnlink ? identityLabel(pendingUnlink, t) : t("该登录方式") })}
        icon={<Unlink size={18} />}
        isBusy={isSubmitting}
        busyLabel={submittingAction === "unlinkIdentity" ? t("正在解绑...") : t("请等待当前操作完成")}
        open={pendingUnlink !== null}
        title={t("确认解绑登录方式？")}
        onCancel={() => {
          if (!isSubmitting) {
            setPendingUnlink(null);
          }
        }}
        onConfirm={() => void handleUnlink()}
      />
    </>
  );
}

function IdentityRow({
  identity,
  isCurrent,
  onUnlink,
  disabled,
}: {
  identity: AccountIdentity;
  isCurrent: boolean;
  onUnlink?: () => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-background px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        {isCurrent ? <ShieldCheck size={15} /> : <Link2 size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">
          {identityLabel(identity.provider, t)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {isCurrent ? t("当前登录方式") : t("已绑定")}
        </p>
      </div>
      {onUnlink ? (
        <Button
          className="min-h-8 shrink-0 px-2.5 py-1.5 text-[11px]"
          icon={<Unlink size={12} />}
          size="sm"
          title={`${t("解绑")} ${identityLabel(identity.provider, t)}`}
          disabled={disabled}
          onClick={onUnlink}
        >
          {t("解绑")}
        </Button>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-xs text-foreground ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function getVisibleIdentities(
  user: AccountUser,
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
): AccountIdentity[] {
  if (user.identities && user.identities.length > 0) {
    return user.identities.filter((identity) => identity.provider !== "guli");
  }
  const fallbackProvider = loginProvider ?? provider ?? "guli";
  if (fallbackProvider === "guli") return [];
  return [
    {
      provider: fallbackProvider,
      providerUserId: user.uid,
    },
  ];
}

function isCurrentIdentity(
  identity: AccountIdentity,
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
): boolean {
  return identity.provider === (loginProvider ?? provider);
}

function identityLabel(provider: AccountIdentity["provider"] | AccountExternalProviderId, t: (text: string) => string): string {
  return (
    ACCOUNT_IDENTITY_PROVIDER_LABELS[provider as keyof typeof ACCOUNT_IDENTITY_PROVIDER_LABELS] ??
    ACCOUNT_LOGIN_PROVIDER_LABELS[provider as AccountLoginProviderId] ??
    t("登录方式")
  );
}

function accountSubtitle(
  user: AccountUser,
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
  t: (text: string) => string,
): string {
  if (user.email) {
    return user.email;
  }
  return `${loginProviderLabel(loginProvider, provider, t)} ${t("登录")}`;
}

function loginProviderLabel(
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
  t: (text: string) => string,
): string {
  if (loginProvider) {
    return t(ACCOUNT_LOGIN_PROVIDER_LABELS[loginProvider]);
  }
  return provider ? t(LEGACY_PROVIDER_LABELS[provider]) : t("账号");
}

function formatDate(value: string, language: "zh-CN" | "en-US"): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? language === "en-US" ? "Unknown" : "未知"
    : date.toLocaleDateString(language);
}
