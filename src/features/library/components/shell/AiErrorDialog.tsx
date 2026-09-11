import { AlertTriangle, CircleDollarSign, Info, Network, Settings2 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { AiErrorPresentation } from "../../utils/aiErrorPresentation";

type AiErrorDialogProps = {
  presentation: AiErrorPresentation;
  onClose: () => void;
  onOpenSettings: () => void;
};

export function AiErrorDialog({ presentation, onClose, onOpenSettings }: AiErrorDialogProps) {
  const Icon = presentation.code === "AI_QUOTA_EXCEEDED"
    ? CircleDollarSign
    : presentation.code.includes("TIMEOUT")
      ? Network
      : presentation.code.includes("REQUEST") || presentation.code.includes("FAILED")
        ? AlertTriangle
        : Info;

  return (
    <AppDialog
      overlayClassName="z-[240] px-4 py-8"
      panelClassName="relative z-[241] flex max-h-[90vh] w-full max-w-xl flex-col"
      titleId="ai-error-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{presentation.targetLabel}</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground" id="ai-error-dialog-title">
            {presentation.title}
          </h2>
        </div>
        <DialogCloseButton ariaLabel={"\u5173\u95ed AI \u9519\u8bef\u63d0\u793a"} onClick={onClose} />
      </header>

      <div className="min-h-0 overflow-y-auto px-5 py-5">
        <section className="rounded-xl border border-danger/20 bg-danger-soft/40 px-4 py-3 text-sm leading-6 text-foreground">
          {presentation.summary}
        </section>

        <section className="mt-4 grid gap-2">
          <h3 className="text-sm font-semibold text-foreground">{"\u53ef\u80fd\u539f\u56e0"}</h3>
          <p className="text-sm leading-6 text-muted">{presentation.cause}</p>
        </section>

        <section className="mt-4 grid gap-2">
          <h3 className="text-sm font-semibold text-foreground">{"\u5efa\u8bae\u5904\u7406"}</h3>
          <ol className="grid gap-2 text-sm leading-6 text-muted">
            {presentation.actions.map((action, index) => (
              <li className="flex gap-2" key={action}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-foreground">
                  {index + 1}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-5 flex items-center gap-2 text-xs text-muted">
          <Settings2 size={14} /> {"\u9519\u8bef\u7801\uff1a"}{presentation.code}
        </p>
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button className="min-h-8 px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={onClose}>
          {"\u77e5\u9053\u4e86"}
        </Button>
        <Button className="min-h-8 px-2.5 py-1.5 text-xs" type="button" variant="primary" onClick={onOpenSettings}>
          {"\u6253\u5f00 AI \u8bbe\u7f6e"}
        </Button>
      </footer>
    </AppDialog>
  );
}
