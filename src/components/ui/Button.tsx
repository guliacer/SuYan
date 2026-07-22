import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary-strong",
  secondary: "border-border bg-panel text-foreground hover:bg-background",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-panel",
  danger: "border-danger bg-danger text-danger-foreground hover:bg-danger-strong",
};

export function Button({ children, icon, variant = "secondary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
      {children ? <span className="truncate">{children}</span> : null}
    </button>
  );
}
