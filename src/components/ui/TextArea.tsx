import type { Ref, TextareaHTMLAttributes } from "react";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  resizeMode?: "none" | "vertical";
};

export function TextArea({ className = "", ref, resizeMode = "none", ...props }: TextAreaProps) {
  const resizeClass = resizeMode === "vertical" ? "resize-y" : "resize-none";

  return (
    <textarea
      className={`w-full ${resizeClass} rounded-xl border border-border bg-panel p-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      ref={ref}
      {...props}
    />
  );
}
