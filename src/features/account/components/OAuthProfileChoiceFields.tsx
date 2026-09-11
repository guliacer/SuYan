import { ImagePlus } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type {
  AccountOAuthProfileSelection,
  AccountProfileSource,
  AccountUser,
} from "../types/account";
import { UserAvatar } from "./UserAvatar";

type OAuthProfileChoiceFieldsProps = {
  currentUser: AccountUser | null;
  pendingUser: AccountUser;
  selection: AccountOAuthProfileSelection;
  customAvatarPreview: string | null;
  disabled?: boolean;
  onChange: (selection: AccountOAuthProfileSelection) => void;
  onChooseCustomAvatar: () => Promise<boolean>;
};

const sources: ReadonlyArray<{ value: AccountProfileSource; label: string }> = [
  { value: "current", label: "当前资料" },
  { value: "new", label: "新登录资料" },
  { value: "custom", label: "自定义" },
];

export function OAuthProfileChoiceFields({
  currentUser,
  pendingUser,
  selection,
  customAvatarPreview,
  disabled = false,
  onChange,
  onChooseCustomAvatar,
}: OAuthProfileChoiceFieldsProps) {
  const { t } = useLocale();
  const customPreviewUser = customAvatarPreview
    ? { ...pendingUser, avatarUrl: customAvatarPreview }
    : pendingUser;

  async function chooseCustomAvatar(): Promise<void> {
    const selected = await onChooseCustomAvatar();
    if (selected) {
      onChange({ ...selection, avatarSource: "custom" });
    }
  }

  return (
    <section className="grid gap-3 border-t border-primary/20 pt-3" aria-label={t("登录后资料设置")}>
      <div>
        <p className="font-semibold text-foreground">{t("登录后使用哪份资料")}</p>
        <p className="mt-1 text-muted">{t("先确认昵称和头像来源，再完成登录或绑定。自定义头像只会在你确认后保存。")}</p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-[11px] font-semibold text-muted">{t("昵称")}</legend>
        <div className="grid gap-2 min-[420px]:grid-cols-3">
          {sources.map((source) => {
            const isDisabled = disabled || (source.value === "current" && !currentUser);
            return (
              <label
                className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  selection.usernameSource === source.value
                    ? "border-primary bg-panel text-foreground"
                    : "border-border/80 bg-background text-muted"
                } ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/45"}`}
                key={source.value}
              >
                <input
                  checked={selection.usernameSource === source.value}
                  className="accent-primary"
                  disabled={isDisabled}
                  name="oauth-profile-username-source"
                  type="radio"
                  value={source.value}
                  onChange={() => onChange({ ...selection, usernameSource: source.value })}
                />
                <span className="truncate">{t(source.label)}</span>
              </label>
            );
          })}
        </div>
        {selection.usernameSource === "custom" ? (
          <label className="grid gap-1.5 text-[11px] font-medium text-muted" htmlFor="oauth-custom-username">
            {t("自定义昵称")}
            <TextField
              autoComplete="nickname"
              disabled={disabled}
              id="oauth-custom-username"
              maxLength={64}
              placeholder={t("输入 1-64 个字符")}
              value={selection.customUsername ?? ""}
              onChange={(event) => onChange({ ...selection, customUsername: event.target.value })}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-[11px] font-semibold text-muted">{t("头像")}</legend>
        <div className="grid gap-2 min-[420px]:grid-cols-3">
          {sources.map((source) => {
            const isDisabled = disabled || (source.value === "current" && !currentUser);
            const previewUser = source.value === "current" ? currentUser : source.value === "custom" ? customPreviewUser : pendingUser;
            return (
              <label
                className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  selection.avatarSource === source.value
                    ? "border-primary bg-panel text-foreground"
                    : "border-border/80 bg-background text-muted"
                } ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/45"}`}
                key={source.value}
              >
                <input
                  checked={selection.avatarSource === source.value}
                  className="accent-primary"
                  disabled={isDisabled}
                  name="oauth-profile-avatar-source"
                  type="radio"
                  value={source.value}
                  onChange={() => onChange({ ...selection, avatarSource: source.value })}
                />
                {previewUser ? <UserAvatar size={22} user={previewUser} /> : null}
                <span className="truncate">{t(source.label)}</span>
              </label>
            );
          })}
        </div>
        {selection.avatarSource === "custom" ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background px-3 py-2">
            <UserAvatar size={34} user={customPreviewUser} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                {customAvatarPreview ? t("已选择自定义头像") : t("还没有选择自定义头像")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{t("PNG、JPEG 或 WebP，最大 256 KiB")}</p>
            </div>
            <Button
              className="shrink-0 px-2.5 text-xs"
              disabled={disabled}
              icon={<ImagePlus size={13} />}
              size="sm"
              title={t("选择自定义头像")}
              onClick={() => void chooseCustomAvatar()}
            >
              {customAvatarPreview ? t("更换") : t("选择")}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </section>
  );
}
