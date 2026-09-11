import type { SVGProps } from "react";

/**
 * 账户入口图标（与 lucide 风格统一）。
 * - 2px 描边、圆角端点、无填充，跟随父级 color。
 * - 用于未登录状态的侧边栏账号入口，语义为“账户”而非“登录”。
 */
export function AccountIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
      {...props}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
