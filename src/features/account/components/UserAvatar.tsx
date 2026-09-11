import { useEffect, useState } from "react";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { useLocale } from "@/components/LocaleProvider";
import type { AccountUser } from "../types/account";

/**
 * 当前登录用户头像（方案 §二十）：来源为 AccountUser.avatarUrl。
 * 第三方头像失效时显示默认头像，绝不让头像问题把账号系统带入错误状态。
 */

type UserAvatarProps = {
  user: AccountUser;
  size?: number;
  className?: string;
};

export function UserAvatar({ user, size = 32, className = "" }: UserAvatarProps) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  const avatarUrl = user.avatarUrl && !failed ? user.avatarUrl : null;

  useEffect(() => {
    setFailed(false);
  }, [user.avatarUrl]);

  if (avatarUrl) {
    return (
      <img
        alt={`${user.username} ${t("头像")}`}
        className={`rounded-full object-cover ${className}`}
        height={size}
        src={avatarUrl}
        style={{ height: size, width: size }}
        width={size}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-label={`${user.username} ${t("头像")}`}
      className={`flex items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ height: size, width: size }}
    >
      <AppLogoMark className="size-full rounded-full" />
    </span>
  );
}
