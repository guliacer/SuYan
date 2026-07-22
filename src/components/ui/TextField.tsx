import type { InputHTMLAttributes } from "react";

export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-xl border border-border bg-panel px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  );
}
